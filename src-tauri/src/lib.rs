use chrono::Local;
use rfd::FileDialog;
use std::collections::{HashMap, HashSet};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Emitter, Manager};
use uppsala::dom::{Document, NodeId, NodeKind};
use uppsala::{parse as parse_xml, XPathEvaluator, XPathValue, XsdValidator};

static LOG_MUTEX: Mutex<()> = Mutex::new(());
static SETTINGS_DIRTY: AtomicBool = AtomicBool::new(false);

const MAX_LOG_SIZE_BYTES: u64 = 2 * 1024 * 1024; // 2 MB rotation cap

fn get_log_file_path() -> std::path::PathBuf {
  if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
    let log_dir = std::path::PathBuf::from(local_app_data)
      .join("com.fileditor.app")
      .join("logs");
    if fs::create_dir_all(&log_dir).is_ok() {
      let log_path = log_dir.join("fileditor.log");
      if OpenOptions::new().create(true).append(true).open(&log_path).is_ok() {
        return log_path;
      }
    }
  }
  std::env::temp_dir().join("fileditor.log")
}

#[tauri::command]
fn get_log_path() -> String {
  get_log_file_path().to_string_lossy().to_string()
}

pub fn append_log(level: &str, component: &str, message: &str) {
  let _guard = LOG_MUTEX.lock();
  let log_path = get_log_file_path();

  if let Ok(meta) = fs::metadata(&log_path) {
    if meta.len() > MAX_LOG_SIZE_BYTES {
      let backup_path = log_path.with_file_name("fileditor.old.log");
      let _ = fs::rename(&log_path, backup_path);
    }
  }

  let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
  let formatted = format!("[{}] [{}] [{}] {}\n", timestamp, level.to_uppercase(), component, message);

  if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
    let _ = file.write_all(formatted.as_bytes());
  }
}

#[tauri::command]
fn write_log(level: String, component: String, message: String) -> Result<(), String> {
  append_log(&level, &component, &message);
  Ok(())
}

#[derive(serde::Serialize)]
struct XmlValidationError {
  path: String,
  message: String,
}

#[tauri::command]
fn open_file_dialog(title: String, filter_name: String, filter_ext: String) -> Option<String> {
  let mut dialog = FileDialog::new().set_title(&title);
  if !filter_name.is_empty() && !filter_ext.is_empty() {
    let exts: Vec<&str> = filter_ext.split([';', ',']).map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    dialog = dialog.add_filter(&filter_name, &exts);
  }
  dialog.pick_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn save_file_dialog(title: String, default_name: String, filter_name: String, filter_ext: String) -> Option<String> {
  let mut dialog = FileDialog::new().set_title(&title).set_file_name(&default_name);
  if !filter_name.is_empty() && !filter_ext.is_empty() {
    let exts: Vec<&str> = filter_ext.split([';', ',']).map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    dialog = dialog.add_filter(&filter_name, &exts);
  }
  dialog.save_file().map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
  fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
  fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_file_modified_time(path: String) -> Result<u64, String> {
  let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
  let modified = metadata.modified().map_err(|e| e.to_string())?;
  let duration = modified.duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
  Ok(duration.as_millis() as u64)
}

#[tauri::command]
fn file_exists(path: String) -> bool {
  fs::metadata(&path).is_ok()
}

#[tauri::command]
fn close_app(app: AppHandle) {
  app.exit(0);
}

// ============================================================================
// Multi-Schema XML Validation (XSD 1.0/1.1, DTD, RelaxNG XML, ISO Schematron)
// ============================================================================

#[derive(Debug, Clone)]
enum DtdContentSpec {
  Empty,
  Any,
  Mixed(HashSet<String>), // (#PCDATA | a | b)* or (#PCDATA)
  Children(String),       // Content model expression e.g. "(title, author+, year?)"
}

#[derive(Debug, Clone)]
enum DtdAttrDefault {
  Required,
  Implied,
  Fixed(String),
  DefaultValue,
}

#[derive(Debug, Clone)]
struct DtdAttrDecl {
  name: String,
  attr_type: String, // CDATA, ID, NMTOKEN, or "(a|b|c)"
  default_decl: DtdAttrDefault,
}

#[derive(Debug, Default)]
struct DtdSchema {
  root_name: Option<String>,
  elements: HashMap<String, DtdContentSpec>,
  attributes: HashMap<String, Vec<DtdAttrDecl>>,
}

fn strip_xml_comments(input: &str) -> String {
  let mut out = String::with_capacity(input.len());
  let mut rest = input;
  while let Some(start) = rest.find("<!--") {
    out.push_str(&rest[..start]);
    if let Some(end) = rest[start + 4..].find("-->") {
      rest = &rest[start + 4 + end + 3..];
    } else {
      return out;
    }
  }
  out.push_str(rest);
  out
}

fn strip_xml_pis_and_comments(input: &str) -> String {
  let without_comments = strip_xml_comments(input);
  let mut out = String::with_capacity(without_comments.len());
  let mut rest = without_comments.as_str();
  while let Some(start) = rest.find("<?") {
    out.push_str(&rest[..start]);
    if let Some(end) = rest[start + 2..].find("?>") {
      rest = &rest[start + 2 + end + 2..];
    } else {
      return out;
    }
  }
  out.push_str(rest);
  out
}

fn parse_dtd_declarations(raw_dtd: &str) -> Result<DtdSchema, String> {
  let cleaned = strip_xml_comments(raw_dtd);
  let mut schema = DtdSchema::default();

  // Extract internal subset if full <!DOCTYPE root [ ... ]> was provided
  let mut body = cleaned.trim();
  if let Some(dt_idx) = body.find("<!DOCTYPE") {
    let after_dt = &body[dt_idx + 9..];
    let root_token: String = after_dt
      .trim_start()
      .chars()
      .take_while(|c| !c.is_whitespace() && *c != '[' && *c != '>')
      .collect();
    if !root_token.is_empty() {
      schema.root_name = Some(root_token);
    }
    if let (Some(open_b), Some(close_b)) = (after_dt.find('['), after_dt.rfind(']')) {
      if close_b > open_b {
        body = &after_dt[open_b + 1..close_b];
      }
    }
  }

  let mut cursor = body;
  while let Some(decl_start) = cursor.find("<!") {
    let after_bang = &cursor[decl_start + 2..];
    // Find matching '>' outside quotes
    let mut in_quote: Option<char> = None;
    let mut end_offset = None;
    for (idx, ch) in after_bang.char_indices() {
      match in_quote {
        Some(q) if ch == q => in_quote = None,
        None if ch == '"' || ch == '\'' => in_quote = Some(ch),
        None if ch == '>' => {
          end_offset = Some(idx);
          break;
        }
        _ => {}
      }
    }
    let Some(end_idx) = end_offset else {
      return Err("Unvollständige DTD-Deklaration (fehlendes '>').".to_string());
    };

    let decl = after_bang[..end_idx].trim();
    cursor = &after_bang[end_idx + 1..];

    if let Some(rest) = decl.strip_prefix("ELEMENT") {
      let rest = rest.trim();
      let elem_name: String = rest.chars().take_while(|c| !c.is_whitespace()).collect();
      let spec_raw = rest[elem_name.len()..].trim();
      if elem_name.is_empty() || spec_raw.is_empty() {
        return Err(format!("Ungültige <!ELEMENT>-Deklaration: <!{decl}>"));
      }
      let spec = if spec_raw == "EMPTY" {
        DtdContentSpec::Empty
      } else if spec_raw == "ANY" {
        DtdContentSpec::Any
      } else if spec_raw.contains("#PCDATA") {
        let inner = spec_raw
          .trim_end_matches('*')
          .trim()
          .trim_start_matches('(')
          .trim_end_matches(')');
        let mut allowed = HashSet::new();
        for part in inner.split('|') {
          let token = part.trim();
          if !token.is_empty() && token != "#PCDATA" {
            allowed.insert(token.to_string());
          }
        }
        DtdContentSpec::Mixed(allowed)
      } else {
        DtdContentSpec::Children(spec_raw.to_string())
      };
      schema.elements.insert(elem_name, spec);
    } else if let Some(rest) = decl.strip_prefix("ATTLIST") {
      let rest = rest.trim();
      let elem_name: String = rest.chars().take_while(|c| !c.is_whitespace()).collect();
      if elem_name.is_empty() {
        return Err(format!("Ungültige <!ATTLIST>-Deklaration: <!{decl}>"));
      }
      let attrs_str = rest[elem_name.len()..].trim();
      let parsed_attrs = parse_dtd_attlist_tokens(attrs_str)?;
      schema
        .attributes
        .entry(elem_name)
        .or_default()
        .extend(parsed_attrs);
    }
  }

  if schema.elements.is_empty() && schema.attributes.is_empty() && schema.root_name.is_none() {
    return Err("Keine gültigen DTD-Deklarationen (<!ELEMENT> / <!ATTLIST>) gefunden.".to_string());
  }

  Ok(schema)
}

fn tokenize_dtd_attlist(s: &str) -> Vec<String> {
  let mut tokens = Vec::new();
  let mut current = String::new();
  let mut in_quote: Option<char> = None;
  let mut paren_depth = 0usize;

  for ch in s.chars() {
    if let Some(q) = in_quote {
      current.push(ch);
      if ch == q {
        in_quote = None;
      }
    } else if ch == '"' || ch == '\'' {
      in_quote = Some(ch);
      current.push(ch);
    } else if ch == '(' {
      paren_depth += 1;
      current.push(ch);
    } else if ch == ')' {
      paren_depth = paren_depth.saturating_sub(1);
      current.push(ch);
    } else if ch.is_whitespace() && paren_depth == 0 {
      if !current.is_empty() {
        tokens.push(std::mem::take(&mut current));
      }
    } else {
      current.push(ch);
    }
  }
  if !current.is_empty() {
    tokens.push(current);
  }
  tokens
}

fn parse_dtd_attlist_tokens(s: &str) -> Result<Vec<DtdAttrDecl>, String> {
  let tokens = tokenize_dtd_attlist(s);
  let mut out = Vec::new();
  let mut i = 0;
  while i < tokens.len() {
    if i + 2 >= tokens.len() {
      break;
    }
    let name = tokens[i].clone();
    let mut attr_type = tokens[i + 1].clone();
    let mut idx = i + 2;
    if attr_type == "NOTATION" && idx < tokens.len() {
      attr_type = format!("NOTATION {}", tokens[idx]);
      idx += 1;
    }
    if idx >= tokens.len() {
      return Err(format!("Fehlende Standarddeklaration für Attribut '{name}'."));
    }
    let def_tok = &tokens[idx];
    let default_decl = if def_tok == "#REQUIRED" {
      idx += 1;
      DtdAttrDefault::Required
    } else if def_tok == "#IMPLIED" {
      idx += 1;
      DtdAttrDefault::Implied
    } else if def_tok == "#FIXED" {
      if idx + 1 >= tokens.len() {
        return Err(format!("Fehlender Wert nach #FIXED für Attribut '{name}'."));
      }
      let val = tokens[idx + 1].trim_matches('"').trim_matches('\'').to_string();
      idx += 2;
      DtdAttrDefault::Fixed(val)
    } else {
      idx += 1;
      DtdAttrDefault::DefaultValue
    };
    out.push(DtdAttrDecl {
      name,
      attr_type,
      default_decl,
    });
    i = idx;
  }
  Ok(out)
}

// Evaluate DTD element content model against actual child element names via recursive regex-free NFA/backtracker
#[derive(Debug, Clone)]
enum CpNode {
  Name(String),
  Seq(Vec<CpItem>),
  Choice(Vec<CpItem>),
}

#[derive(Debug, Clone)]
struct CpItem {
  node: CpNode,
  quant: Option<char>, // None, '?', '*', '+'
}

fn parse_dtd_cp(spec: &str) -> Option<CpItem> {
  fn skip_ws(chars: &[char], pos: &mut usize) {
    while *pos < chars.len() && chars[*pos].is_whitespace() {
      *pos += 1;
    }
  }
  fn parse_item(chars: &[char], pos: &mut usize) -> Option<CpItem> {
    skip_ws(chars, pos);
    if *pos >= chars.len() {
      return None;
    }
    let node = if chars[*pos] == '(' {
      *pos += 1;
      let mut items = Vec::new();
      let mut sep: Option<char> = None;
      loop {
        let sub = parse_item(chars, pos)?;
        items.push(sub);
        skip_ws(chars, pos);
        if *pos >= chars.len() {
          return None;
        }
        if chars[*pos] == ')' {
          *pos += 1;
          break;
        } else if chars[*pos] == ',' || chars[*pos] == '|' {
          sep = Some(chars[*pos]);
          *pos += 1;
        } else {
          return None;
        }
      }
      match sep {
        Some('|') => CpNode::Choice(items),
        _ => CpNode::Seq(items),
      }
    } else {
      let start = *pos;
      while *pos < chars.len()
        && !chars[*pos].is_whitespace()
        && !matches!(chars[*pos], '(' | ')' | ',' | '|' | '?' | '*' | '+')
      {
        *pos += 1;
      }
      if *pos == start {
        return None;
      }
      let name: String = chars[start..*pos].iter().collect();
      CpNode::Name(name)
    };
    let quant = if *pos < chars.len() && matches!(chars[*pos], '?' | '*' | '+') {
      let q = chars[*pos];
      *pos += 1;
      Some(q)
    } else {
      None
    };
    Some(CpItem { node, quant })
  }

  let chars: Vec<char> = spec.chars().collect();
  let mut pos = 0;
  parse_item(&chars, &mut pos)
}

fn match_cp_item(item: &CpItem, children: &[String], positions: &HashSet<usize>) -> HashSet<usize> {
  fn match_node(node: &CpNode, children: &[String], positions: &HashSet<usize>) -> HashSet<usize> {
    match node {
      CpNode::Name(expected) => {
        let mut next = HashSet::new();
        for &p in positions {
          if p < children.len() && children[p] == *expected {
            next.insert(p + 1);
          }
        }
        next
      }
      CpNode::Seq(seq) => {
        let mut curr = positions.clone();
        for sub in seq {
          curr = match_cp_item(sub, children, &curr);
          if curr.is_empty() {
            break;
          }
        }
        curr
      }
      CpNode::Choice(choices) => {
        let mut out = HashSet::new();
        for sub in choices {
          out.extend(match_cp_item(sub, children, positions));
        }
        out
      }
    }
  }

  match item.quant {
    None => match_node(&item.node, children, positions),
    Some('?') => {
      let mut out = positions.clone();
      out.extend(match_node(&item.node, children, positions));
      out
    }
    Some('*') => {
      let mut visited = positions.clone();
      let mut frontier = positions.clone();
      while !frontier.is_empty() {
        let step = match_node(&item.node, children, &frontier);
        let mut next_frontier = HashSet::new();
        for p in step {
          if visited.insert(p) {
            next_frontier.insert(p);
          }
        }
        frontier = next_frontier;
      }
      visited
    }
    Some('+') => {
      let first = match_node(&item.node, children, positions);
      let mut visited = first.clone();
      let mut frontier = first;
      while !frontier.is_empty() {
        let step = match_node(&item.node, children, &frontier);
        let mut next_frontier = HashSet::new();
        for p in step {
          if visited.insert(p) {
            next_frontier.insert(p);
          }
        }
        frontier = next_frontier;
      }
      visited
    }
    _ => match_node(&item.node, children, positions),
  }
}

fn validate_with_dtd(doc: &Document<'_>, schema: &DtdSchema) -> Vec<XmlValidationError> {
  let mut errors = Vec::new();
  let mut seen_ids = HashSet::new();

  let Some(root_id) = doc.document_element() else {
    errors.push(XmlValidationError {
      path: "/".to_string(),
      message: "XML-Dokument enthält kein Wurzelelement.".to_string(),
    });
    return errors;
  };

  if let (Some(expected_root), Some(root_elem)) = (&schema.root_name, doc.element(root_id)) {
    let actual = root_elem.name.prefixed_name();
    if actual.as_ref() != expected_root && root_elem.name.local_name.as_ref() != expected_root {
      errors.push(XmlValidationError {
        path: format!("/{actual}"),
        message: format!("Wurzelelement '{actual}' stimmt nicht mit DOCTYPE '{expected_root}' überein."),
      });
    }
  }

  fn walk_dtd_node(
    doc: &Document<'_>,
    node_id: NodeId,
    path: &str,
    schema: &DtdSchema,
    seen_ids: &mut HashSet<String>,
    errors: &mut Vec<XmlValidationError>,
  ) {
    let Some(elem) = doc.element(node_id) else {
      return;
    };
    let elem_name = elem.name.prefixed_name().to_string();
    let local_name = elem.name.local_name.to_string();
    let current_path = format!("{path}/{elem_name}");

    let spec = schema
      .elements
      .get(&elem_name)
      .or_else(|| schema.elements.get(&local_name));

    let mut child_elem_ids = Vec::new();
    let mut child_elem_names = Vec::new();
    let mut has_non_ws_text = false;

    for cid in doc.children(node_id) {
      match doc.node_kind(cid) {
        Some(NodeKind::Element(ce)) => {
          child_elem_ids.push(cid);
          let cname = ce.name.prefixed_name().to_string();
          if schema.elements.contains_key(&cname) {
            child_elem_names.push(cname);
          } else {
            child_elem_names.push(ce.name.local_name.to_string());
          }
        }
        Some(NodeKind::Text(t)) | Some(NodeKind::CData(t)) => {
          if !t.trim().is_empty() {
            has_non_ws_text = true;
          }
        }
        _ => {}
      }
    }

    match spec {
      None => {
        if !schema.elements.is_empty() {
          errors.push(XmlValidationError {
            path: current_path.clone(),
            message: format!("Element '<{elem_name}>' ist nicht in der DTD deklariert."),
          });
        }
      }
      Some(DtdContentSpec::Empty) => {
        if !child_elem_ids.is_empty() || has_non_ws_text {
          errors.push(XmlValidationError {
            path: current_path.clone(),
            message: format!("Element '<{elem_name}>' ist als EMPTY deklariert, enthält aber Inhalt."),
          });
        }
      }
      Some(DtdContentSpec::Any) => {}
      Some(DtdContentSpec::Mixed(allowed)) => {
        if allowed.is_empty() && !child_elem_ids.is_empty() {
          errors.push(XmlValidationError {
            path: current_path.clone(),
            message: format!(
              "Element '<{elem_name}>' erlaubt nur Text (#PCDATA), enthält aber Kind-Elemente: {:?}.",
              child_elem_names
            ),
          });
        } else {
          for cname in &child_elem_names {
            if !allowed.contains(cname) {
              errors.push(XmlValidationError {
                path: current_path.clone(),
                message: format!("Kind-Element '<{cname}>' ist in '<{elem_name}>' laut DTD nicht erlaubt."),
              });
            }
          }
        }
      }
      Some(DtdContentSpec::Children(expr)) => {
        if has_non_ws_text {
          errors.push(XmlValidationError {
            path: current_path.clone(),
            message: format!(
              "Element '<{elem_name}>' erlaubt nur Kind-Elemente ({expr}), enthält aber direkten Text."
            ),
          });
        }
        if let Some(cp) = parse_dtd_cp(expr) {
          let mut start_set = HashSet::new();
          start_set.insert(0usize);
          let end_set = match_cp_item(&cp, &child_elem_names, &start_set);
          if !end_set.contains(&child_elem_names.len()) {
            errors.push(XmlValidationError {
              path: current_path.clone(),
              message: format!(
                "Kind-Elemente {:?} von '<{elem_name}>' entsprechen nicht dem DTD-Inhaltsmodell {expr}.",
                child_elem_names
              ),
            });
          }
        }
      }
    }

    // Attribute validation
    if let Some(attr_decls) = schema
      .attributes
      .get(&elem_name)
      .or_else(|| schema.attributes.get(&local_name))
    {
      for decl in attr_decls {
        let actual_val = elem.get_attribute(&decl.name);
        match (&decl.default_decl, actual_val) {
          (DtdAttrDefault::Required, None) => {
            errors.push(XmlValidationError {
              path: format!("{current_path}/@{}", decl.name),
              message: format!("Pflichtattribut '{}' (#REQUIRED) fehlt an '<{elem_name}>'.", decl.name),
            });
          }
          (DtdAttrDefault::Fixed(expected), Some(actual)) if actual != expected => {
            errors.push(XmlValidationError {
              path: format!("{current_path}/@{}", decl.name),
              message: format!(
                "Attribut '{}' muss den festen Wert '{}' (#FIXED) haben (gefunden: '{}').",
                decl.name, expected, actual
              ),
            });
          }
          _ => {}
        }

        if let Some(val) = actual_val {
          if decl.attr_type.starts_with('(') && decl.attr_type.ends_with(')') {
            let inner = &decl.attr_type[1..decl.attr_type.len() - 1];
            let allowed_vals: Vec<&str> = inner.split('|').map(|s| s.trim()).collect();
            if !allowed_vals.contains(&val) {
              errors.push(XmlValidationError {
                path: format!("{current_path}/@{}", decl.name),
                message: format!(
                  "Ungültiger Wert '{}' für Attribut '{}'. Erlaubt: {}.",
                  val, decl.name, decl.attr_type
                ),
              });
            }
          } else if decl.attr_type == "ID" {
            if val.trim().is_empty() {
              errors.push(XmlValidationError {
                path: format!("{current_path}/@{}", decl.name),
                message: format!("ID-Attribut '{}' darf nicht leer sein.", decl.name),
              });
            } else if !seen_ids.insert(val.to_string()) {
              errors.push(XmlValidationError {
                path: format!("{current_path}/@{}", decl.name),
                message: format!("Doppelter ID-Wert '{}' gefunden (ID muss eindeutig sein).", val),
              });
            }
          }
        }
      }
    }

    for cid in child_elem_ids {
      walk_dtd_node(doc, cid, &current_path, schema, seen_ids, errors);
    }
  }

  walk_dtd_node(doc, root_id, "", schema, &mut seen_ids, &mut errors);
  errors
}

// ============================================================================
// RelaxNG (XML syntax .rng) Validator
// ============================================================================

#[derive(Debug, Clone)]
enum RngPattern {
  Empty,
  Text,
  NotAllowed,
  Element { name: Option<String>, pattern: Box<RngPattern> },
  Attribute { name: Option<String>, pattern: Box<RngPattern> },
  Group(Vec<RngPattern>),
  Interleave(Vec<RngPattern>),
  Choice(Vec<RngPattern>),
  Optional(Box<RngPattern>),
  ZeroOrMore(Box<RngPattern>),
  OneOrMore(Box<RngPattern>),
  Ref(String),
  Data { datatype: String },
  Value(String),
}

struct RngGrammar {
  start: RngPattern,
  defines: HashMap<String, RngPattern>,
}

fn compile_rng_children(doc: &Document<'_>, node_id: NodeId, combine_choice: bool) -> RngPattern {
  let mut pats = Vec::new();
  for cid in doc.children(node_id) {
    if doc.element(cid).is_some() {
      pats.push(compile_rng_node(doc, cid));
    }
  }
  if pats.is_empty() {
    RngPattern::Empty
  } else if pats.len() == 1 {
    pats.into_iter().next().unwrap()
  } else if combine_choice {
    RngPattern::Choice(pats)
  } else {
    RngPattern::Group(pats)
  }
}

fn extract_rng_name(doc: &Document<'_>, node_id: NodeId) -> Option<String> {
  if let Some(elem) = doc.element(node_id) {
    if let Some(n) = elem.get_attribute("name") {
      return Some(n.split(':').last().unwrap_or(n).to_string());
    }
  }
  for cid in doc.children(node_id) {
    if let Some(ce) = doc.element(cid) {
      if ce.name.local_name == "name" {
        if let Some(txt) = doc.element_text(cid) {
          let t = txt.trim();
          return Some(t.split(':').last().unwrap_or(t).to_string());
        }
      } else if ce.name.local_name == "anyName" {
        return None;
      }
    }
  }
  None
}

fn compile_rng_node(doc: &Document<'_>, node_id: NodeId) -> RngPattern {
  let Some(elem) = doc.element(node_id) else {
    return RngPattern::Empty;
  };
  let tag = elem.name.local_name.as_ref();
  match tag {
    "empty" => RngPattern::Empty,
    "text" => RngPattern::Text,
    "notAllowed" => RngPattern::NotAllowed,
    "ref" => RngPattern::Ref(elem.get_attribute("name").unwrap_or("").to_string()),
    "data" => RngPattern::Data {
      datatype: elem.get_attribute("type").unwrap_or("string").to_string(),
    },
    "value" => RngPattern::Value(doc.element_text(node_id).unwrap_or("").trim().to_string()),
    "optional" => RngPattern::Optional(Box::new(compile_rng_children(doc, node_id, false))),
    "zeroOrMore" => RngPattern::ZeroOrMore(Box::new(compile_rng_children(doc, node_id, false))),
    "oneOrMore" => RngPattern::OneOrMore(Box::new(compile_rng_children(doc, node_id, false))),
    "group" => compile_rng_children(doc, node_id, false),
    "choice" => compile_rng_children(doc, node_id, true),
    "interleave" => {
      let mut pats = Vec::new();
      for cid in doc.children(node_id) {
        if doc.element(cid).is_some() {
          pats.push(compile_rng_node(doc, cid));
        }
      }
      RngPattern::Interleave(pats)
    }
    "element" => {
      let name = extract_rng_name(doc, node_id);
      let mut body_pats = Vec::new();
      for cid in doc.children(node_id) {
        if let Some(ce) = doc.element(cid) {
          if !matches!(ce.name.local_name.as_ref(), "name" | "anyName" | "nsName") {
            body_pats.push(compile_rng_node(doc, cid));
          }
        }
      }
      let inner = if body_pats.is_empty() {
        RngPattern::Empty
      } else if body_pats.len() == 1 {
        body_pats.into_iter().next().unwrap()
      } else {
        RngPattern::Group(body_pats)
      };
      RngPattern::Element {
        name,
        pattern: Box::new(inner),
      }
    }
    "attribute" => {
      let name = extract_rng_name(doc, node_id);
      let mut body_pats = Vec::new();
      for cid in doc.children(node_id) {
        if let Some(ce) = doc.element(cid) {
          if !matches!(ce.name.local_name.as_ref(), "name" | "anyName" | "nsName") {
            body_pats.push(compile_rng_node(doc, cid));
          }
        }
      }
      let inner = if body_pats.is_empty() {
        RngPattern::Text
      } else if body_pats.len() == 1 {
        body_pats.into_iter().next().unwrap()
      } else {
        RngPattern::Group(body_pats)
      };
      RngPattern::Attribute {
        name,
        pattern: Box::new(inner),
      }
    }
    _ => RngPattern::Empty,
  }
}

fn compile_rng_grammar(schema_doc: &Document<'_>) -> Result<RngGrammar, String> {
  let Some(root_id) = schema_doc.document_element() else {
    return Err("RelaxNG-Schema hat kein Wurzelelement.".to_string());
  };
  let Some(root_elem) = schema_doc.element(root_id) else {
    return Err("Ungültiges RelaxNG-Wurzelelement.".to_string());
  };

  if root_elem.name.local_name == "grammar" {
    let mut start_pats = Vec::new();
    let mut defines: HashMap<String, Vec<RngPattern>> = HashMap::new();
    let mut combine_modes: HashMap<String, String> = HashMap::new();

    for cid in schema_doc.children(root_id) {
      let Some(ce) = schema_doc.element(cid) else { continue };
      match ce.name.local_name.as_ref() {
        "start" => start_pats.push(compile_rng_children(schema_doc, cid, false)),
        "define" => {
          if let Some(name) = ce.get_attribute("name") {
            if let Some(comb) = ce.get_attribute("combine") {
              combine_modes.insert(name.to_string(), comb.to_string());
            }
            defines
              .entry(name.to_string())
              .or_default()
              .push(compile_rng_children(schema_doc, cid, false));
          }
        }
        _ => {}
      }
    }

    if start_pats.is_empty() {
      return Err("RelaxNG <grammar> enthält kein <start>-Element.".to_string());
    }
    let start = if start_pats.len() == 1 {
      start_pats.into_iter().next().unwrap()
    } else {
      RngPattern::Choice(start_pats)
    };

    let mut final_defines = HashMap::new();
    for (k, v) in defines {
      let pat = if v.len() == 1 {
        v.into_iter().next().unwrap()
      } else if combine_modes.get(&k).map(|s| s.as_str()) == Some("interleave") {
        RngPattern::Interleave(v)
      } else {
        RngPattern::Choice(v)
      };
      final_defines.insert(k, pat);
    }

    Ok(RngGrammar {
      start,
      defines: final_defines,
    })
  } else {
    Ok(RngGrammar {
      start: compile_rng_node(schema_doc, root_id),
      defines: HashMap::new(),
    })
  }
}

fn check_rng_datatype(datatype: &str, text: &str) -> bool {
  let trimmed = text.trim();
  match datatype {
    "integer" | "int" | "long" | "short" | "byte" => trimmed.parse::<i64>().is_ok(),
    "positiveInteger" => trimmed.parse::<i64>().map(|v| v > 0).unwrap_or(false),
    "nonNegativeInteger" | "unsignedInt" | "unsignedLong" => trimmed.parse::<u64>().is_ok(),
    "decimal" | "float" | "double" => trimmed.parse::<f64>().is_ok(),
    "boolean" => matches!(trimmed, "true" | "false" | "1" | "0"),
    "NCName" | "ID" | "IDREF" | "NMTOKEN" => !trimmed.is_empty() && !trimmed.chars().any(|c| c.is_whitespace()),
    _ => true,
  }
}

fn validate_rng_element(
  doc: &Document<'_>,
  node_id: NodeId,
  pattern: &RngPattern,
  grammar: &RngGrammar,
  path: &str,
  errors: &mut Vec<XmlValidationError>,
  depth: usize,
) -> bool {
  if depth > 64 {
    return true;
  }
  let Some(elem) = doc.element(node_id) else {
    return false;
  };
  let local = elem.name.local_name.as_ref();

  match pattern {
    RngPattern::Ref(name) => {
      if let Some(def) = grammar.defines.get(name) {
        validate_rng_element(doc, node_id, def, grammar, path, errors, depth + 1)
      } else {
        errors.push(XmlValidationError {
          path: path.to_string(),
          message: format!("RelaxNG-Referenz '<ref name=\"{name}\">' wurde nicht definiert."),
        });
        false
      }
    }
    RngPattern::Choice(choices) => {
      let mut sub_errs = Vec::new();
      for c in choices {
        let mut trial_errs = Vec::new();
        if validate_rng_element(doc, node_id, c, grammar, path, &mut trial_errs, depth + 1)
          && trial_errs.is_empty()
        {
          return true;
        }
        sub_errs.extend(trial_errs);
      }
      if sub_errs.is_empty() {
        errors.push(XmlValidationError {
          path: format!("{path}/{local}"),
          message: format!("Element '<{local}>' entspricht keiner erlaubten RelaxNG-Auswahl (<choice>)."),
        });
      } else {
        errors.extend(sub_errs);
      }
      false
    }
    RngPattern::Element {
      name: expected_name,
      pattern: body_pat,
    } => {
      let elem_path = format!("{path}/{local}");
      if let Some(exp) = expected_name {
        if exp != local {
          errors.push(XmlValidationError {
            path: elem_path,
            message: format!("Erwartetes Element '<{exp}>', aber '<{local}>' gefunden."),
          });
          return false;
        }
      }
      validate_rng_content(doc, node_id, body_pat, grammar, &elem_path, errors, depth + 1)
    }
    _ => true,
  }
}

fn collect_rng_expectations(
  pat: &RngPattern,
  grammar: &RngGrammar,
  req_attrs: &mut HashMap<String, RngPattern>,
  opt_attrs: &mut HashMap<String, RngPattern>,
  allows_any_attr: &mut bool,
  elem_specs: &mut Vec<(Option<String>, RngPattern, bool)>, // (name, body_pat, required)
  allows_text: &mut bool,
  scalar_checks: &mut Vec<RngPattern>,
  opt_scalar_checks: &mut Vec<RngPattern>,
  optional_ctx: bool,
  depth: usize,
) {
  if depth > 48 {
    return;
  }
  match pat {
    RngPattern::Empty => {}
    RngPattern::Text => *allows_text = true,
    RngPattern::Data { .. } | RngPattern::Value(_) => {
      *allows_text = true;
      if optional_ctx {
        opt_scalar_checks.push(pat.clone());
      } else {
        scalar_checks.push(pat.clone());
      }
    }
    RngPattern::Ref(name) => {
      if let Some(def) = grammar.defines.get(name) {
        collect_rng_expectations(
          def,
          grammar,
          req_attrs,
          opt_attrs,
          allows_any_attr,
          elem_specs,
          allows_text,
          scalar_checks,
          opt_scalar_checks,
          optional_ctx,
          depth + 1,
        );
      }
    }
    RngPattern::Attribute { name, pattern } => {
      if let Some(n) = name {
        if optional_ctx {
          opt_attrs.insert(n.clone(), (**pattern).clone());
        } else {
          req_attrs.insert(n.clone(), (**pattern).clone());
        }
      } else {
        *allows_any_attr = true;
      }
    }
    RngPattern::Element { name, pattern } => {
      elem_specs.push((name.clone(), (**pattern).clone(), !optional_ctx));
    }
    RngPattern::Optional(inner) | RngPattern::ZeroOrMore(inner) => {
      collect_rng_expectations(
        inner,
        grammar,
        req_attrs,
        opt_attrs,
        allows_any_attr,
        elem_specs,
        allows_text,
        scalar_checks,
        opt_scalar_checks,
        true,
        depth + 1,
      );
    }
    RngPattern::OneOrMore(inner) => {
      collect_rng_expectations(
        inner,
        grammar,
        req_attrs,
        opt_attrs,
        allows_any_attr,
        elem_specs,
        allows_text,
        scalar_checks,
        opt_scalar_checks,
        optional_ctx,
        depth + 1,
      );
    }
    RngPattern::Group(list) | RngPattern::Interleave(list) => {
      for p in list {
        collect_rng_expectations(
          p,
          grammar,
          req_attrs,
          opt_attrs,
          allows_any_attr,
          elem_specs,
          allows_text,
          scalar_checks,
          opt_scalar_checks,
          optional_ctx,
          depth + 1,
        );
      }
    }
    RngPattern::Choice(list) => {
      for p in list {
        collect_rng_expectations(
          p,
          grammar,
          req_attrs,
          opt_attrs,
          allows_any_attr,
          elem_specs,
          allows_text,
          scalar_checks,
          opt_scalar_checks,
          true,
          depth + 1,
        );
      }
    }
    RngPattern::NotAllowed => {}
  }
}

fn resolve_rng_ref<'a>(
  mut pat: &'a RngPattern,
  grammar: &'a RngGrammar,
  depth: usize,
) -> &'a RngPattern {
  let mut steps = depth;
  while let RngPattern::Ref(name) = pat {
    if steps > 32 {
      break;
    }
    if let Some(def) = grammar.defines.get(name) {
      pat = def;
      steps += 1;
    } else {
      break;
    }
  }
  pat
}

fn validate_rng_scalar(pat: &RngPattern, val: &str, path: &str, errors: &mut Vec<XmlValidationError>) -> bool {
  match pat {
    RngPattern::Data { datatype } => {
      if !check_rng_datatype(datatype, val) {
        errors.push(XmlValidationError {
          path: path.to_string(),
          message: format!("Wert '{}' entspricht nicht dem RelaxNG-Datentyp '{}'.", val.trim(), datatype),
        });
        return false;
      }
      true
    }
    RngPattern::Value(expected) => {
      if val.trim() != expected {
        errors.push(XmlValidationError {
          path: path.to_string(),
          message: format!("Erwarteter Wert '{}', aber '{}' gefunden.", expected, val.trim()),
        });
        return false;
      }
      true
    }
    RngPattern::Choice(choices) => {
      for c in choices {
        let mut dummy = Vec::new();
        if validate_rng_scalar(c, val, path, &mut dummy) {
          return true;
        }
      }
      errors.push(XmlValidationError {
        path: path.to_string(),
        message: format!("Wert '{}' ist laut RelaxNG-<choice> nicht erlaubt.", val.trim()),
      });
      false
    }
    _ => true,
  }
}

fn validate_rng_content(
  doc: &Document<'_>,
  node_id: NodeId,
  body_pat: &RngPattern,
  grammar: &RngGrammar,
  path: &str,
  errors: &mut Vec<XmlValidationError>,
  depth: usize,
) -> bool {
  let Some(elem) = doc.element(node_id) else {
    return false;
  };

  let resolved_body = resolve_rng_ref(body_pat, grammar, 0);
  if matches!(resolved_body, RngPattern::Empty) {
    for cid in doc.children(node_id) {
      match doc.node_kind(cid) {
        Some(NodeKind::Element(ce)) => {
          errors.push(XmlValidationError {
            path: path.to_string(),
            message: format!(
              "Element ist als <empty/> definiert, enthält aber Kind-Element '<{}>'.",
              ce.name.local_name
            ),
          });
          return false;
        }
        Some(NodeKind::Text(t)) | Some(NodeKind::CData(t)) if !t.trim().is_empty() => {
          errors.push(XmlValidationError {
            path: path.to_string(),
            message: "Element ist als <empty/> definiert, enthält aber Text.".to_string(),
          });
          return false;
        }
        _ => {}
      }
    }
    return true;
  }

  let mut req_attrs = HashMap::new();
  let mut opt_attrs = HashMap::new();
  let mut allows_any_attr = false;
  let mut elem_specs = Vec::new();
  let mut allows_text = false;
  let mut scalar_checks = Vec::new();
  let mut opt_scalar_checks = Vec::new();

  collect_rng_expectations(
    resolved_body,
    grammar,
    &mut req_attrs,
    &mut opt_attrs,
    &mut allows_any_attr,
    &mut elem_specs,
    &mut allows_text,
    &mut scalar_checks,
    &mut opt_scalar_checks,
    false,
    0,
  );

  let mut ok = true;

  // Check required attributes
  for (attr_name, attr_pat) in &req_attrs {
    match elem.get_attribute(attr_name) {
      None => {
        errors.push(XmlValidationError {
          path: format!("{path}/@{attr_name}"),
          message: format!("Pflichtattribut '{attr_name}' fehlt."),
        });
        ok = false;
      }
      Some(v) => {
        if !validate_rng_scalar(attr_pat, v, &format!("{path}/@{attr_name}"), errors) {
          ok = false;
        }
      }
    }
  }

  // Check optional & unexpected attributes (ignoring xmlns declarations)
  for attr in &elem.attributes {
    let aname = attr.name.local_name.as_ref();
    if aname == "xmlns" || attr.name.prefix.as_deref() == Some("xmlns") {
      continue;
    }
    if req_attrs.contains_key(aname) {
      continue;
    }
    if let Some(opt_pat) = opt_attrs.get(aname) {
      if !validate_rng_scalar(opt_pat, &attr.value, &format!("{path}/@{aname}"), errors) {
        ok = false;
      }
    } else if !allows_any_attr {
      errors.push(XmlValidationError {
        path: format!("{path}/@{aname}"),
        message: format!("Attribut '{aname}' ist im RelaxNG-Schema an dieser Stelle nicht erlaubt."),
      });
      ok = false;
    }
  }

  // Check scalar text constraints
  let combined_text = doc.element_text(node_id).unwrap_or("");
  for sc in &scalar_checks {
    if !validate_rng_scalar(sc, combined_text, path, errors) {
      ok = false;
    }
  }
  if !combined_text.trim().is_empty() {
    for sc in &opt_scalar_checks {
      if !validate_rng_scalar(sc, combined_text, path, errors) {
        ok = false;
      }
    }
  }

  // Check child elements
  let mut seen_children = HashSet::new();
  for cid in doc.children(node_id) {
    if let Some(ce) = doc.element(cid) {
      let cname = ce.name.local_name.to_string();
      seen_children.insert(cname.clone());
      let matching = elem_specs
        .iter()
        .find(|(n, _, _)| n.as_deref() == Some(cname.as_str()) || n.is_none());
      match matching {
        Some((_, child_body_pat, _)) => {
          let child_path = format!("{path}/{cname}");
          if !validate_rng_content(doc, cid, child_body_pat, grammar, &child_path, errors, depth + 1) {
            ok = false;
          }
        }
        None => {
          errors.push(XmlValidationError {
            path: format!("{path}/{cname}"),
            message: format!("Kind-Element '<{cname}>' ist im RelaxNG-Schema hier nicht erlaubt."),
          });
          ok = false;
        }
      }
    } else if !allows_text && !elem_specs.is_empty() {
      if let Some(NodeKind::Text(t)) | Some(NodeKind::CData(t)) = doc.node_kind(cid) {
        if !t.trim().is_empty() {
          errors.push(XmlValidationError {
            path: path.to_string(),
            message: "Direkter Textinhalt ist an dieser Stelle laut RelaxNG-Schema nicht erlaubt.".to_string(),
          });
          ok = false;
        }
      }
    }
  }

  // Check required child elements
  for (req_name, _, is_req) in &elem_specs {
    if *is_req {
      if let Some(rn) = req_name {
        if !seen_children.contains(rn) {
          errors.push(XmlValidationError {
            path: path.to_string(),
            message: format!("Erforderliches Kind-Element '<{rn}>' fehlt."),
          });
          ok = false;
        }
      }
    }
  }

  ok
}

// ============================================================================
// ISO Schematron (.sch) Validator using uppsala XPathEvaluator
// ============================================================================

fn validate_schematron(xml_raw: &str, schema_doc: &Document<'_>) -> Vec<XmlValidationError> {
  let mut errors = Vec::new();
  let Ok(mut doc) = parse_xml(xml_raw) else {
    return errors;
  };
  doc.prepare_xpath();
  let eval = XPathEvaluator::new();
  let root = doc.root();

  let Some(schema_root) = schema_doc.document_element() else {
    return errors;
  };

  let mut rule_nodes = Vec::new();
  fn collect_rules(sdoc: &Document<'_>, nid: NodeId, out: &mut Vec<NodeId>) {
    if let Some(el) = sdoc.element(nid) {
      if el.name.local_name == "rule" {
        out.push(nid);
        return;
      }
    }
    for c in sdoc.children(nid) {
      collect_rules(sdoc, c, out);
    }
  }
  collect_rules(schema_doc, schema_root, &mut rule_nodes);

  for r_id in rule_nodes {
    let Some(r_el) = schema_doc.element(r_id) else { continue };
    let Some(ctx_expr) = r_el.get_attribute("context") else { continue };
    let xpath_ctx = if ctx_expr.starts_with('/') {
      ctx_expr.to_string()
    } else {
      format!("//{ctx_expr}")
    };

    let matched_nodes = match eval.evaluate(&doc, root, &xpath_ctx) {
      Ok(XPathValue::NodeSet(ns)) => ns,
      Err(e) => {
        errors.push(XmlValidationError {
          path: format!("Schematron ({ctx_expr})"),
          message: format!("Ungültiger XPath-Kontext '{ctx_expr}': {e:?}"),
        });
        continue;
      }
      _ => Vec::new(),
    };

    for ctx_node in matched_nodes {
      let node_label = doc
        .element(ctx_node)
        .map(|e| format!("<{}>", e.name.prefixed_name()))
        .unwrap_or_else(|| ctx_expr.to_string());

      for check_id in schema_doc.children(r_id) {
        let Some(check_el) = schema_doc.element(check_id) else { continue };
        let kind = check_el.name.local_name.as_ref();
        if kind != "assert" && kind != "report" {
          continue;
        }
        let Some(test_expr) = check_el.get_attribute("test") else { continue };
        let msg = schema_doc
          .element_text(check_id)
          .map(|s| s.trim().to_string())
          .filter(|s| !s.is_empty())
          .unwrap_or_else(|| format!("Schematron-{kind} fehlgeschlagen: {test_expr}"));

        match eval.evaluate(&doc, ctx_node, test_expr) {
          Ok(val) => {
            let truthy = match val {
              XPathValue::Boolean(b) => b,
              XPathValue::Number(n) => n != 0.0 && !n.is_nan(),
              XPathValue::String(s) => !s.is_empty(),
              XPathValue::NodeSet(ns) => !ns.is_empty(),
            };
            if (kind == "assert" && !truthy) || (kind == "report" && truthy) {
              errors.push(XmlValidationError {
                path: node_label.clone(),
                message: msg,
              });
            }
          }
          Err(e) => {
            errors.push(XmlValidationError {
              path: node_label.clone(),
              message: format!("XPath-Auswertungsfehler in '{test_expr}': {e:?}"),
            });
          }
        }
      }
    }
  }

  errors
}

fn detect_xml_schema_kind(xsd: &str, requested: Option<&str>) -> &'static str {
  if let Some(req) = requested {
    match req.trim().to_lowercase().as_str() {
      "xsd" | "xsd-1.0" | "xsd-1.1" => return "xsd",
      "dtd" => return "dtd",
      "rng" | "relaxng" => return "rng",
      "sch" | "schematron" => return "schematron",
      _ => {}
    }
  }
  let trimmed = xsd.trim_start_matches('\u{FEFF}').trim_start();
  let no_pis = strip_xml_pis_and_comments(trimmed);
  let clean = no_pis.trim_start();
  if clean.starts_with("<!ELEMENT")
    || clean.starts_with("<!ATTLIST")
    || clean.starts_with("<!ENTITY")
    || clean.starts_with("<!DOCTYPE")
    || (!clean.starts_with('<') && xsd.contains("<!ELEMENT"))
  {
    return "dtd";
  }
  if let Ok(sdoc) = parse_xml(trimmed) {
    if let Some(root_id) = sdoc.document_element() {
      if let Some(el) = sdoc.element(root_id) {
        let ns = el.name.namespace_uri.as_deref().unwrap_or("");
        let local = el.name.local_name.as_ref();
        if ns.contains("relaxng.org") || (local == "grammar" && !ns.contains("XMLSchema")) {
          return "rng";
        }
        if ns.contains("schematron") || (local == "schema" && ns.contains("purl.oclc.org/dsdl/schematron")) {
          return "schematron";
        }
      }
    }
  }
  "xsd"
}

#[tauri::command]
fn validate_xml_schema(
  xml: String,
  xsd: String,
  schema_format: Option<String>,
) -> Result<Vec<XmlValidationError>, String> {
  let xml_clean = xml.trim_start_matches('\u{FEFF}');
  let xsd_clean = xsd.trim_start_matches('\u{FEFF}');
  let has_schema = !xsd_clean.trim().is_empty();

  // First parse the XML to check well-formedness
  let doc = match parse_xml(xml_clean) {
    Ok(d) => d,
    Err(e) => {
      return Ok(vec![XmlValidationError {
        path: "XML Syntax".to_string(),
        message: format!("Ungültiges XML: {:?}", e),
      }]);
    }
  };

  if !has_schema {
    // Check if the XML document itself carries an inline <!DOCTYPE ... [ ... ]> internal DTD subset
    if let Some(ref dt) = doc.doctype {
      if dt.contains('[') && (dt.contains("<!ELEMENT") || dt.contains("<!ATTLIST")) {
        if let Ok(inline_dtd) = parse_dtd_declarations(dt) {
          return Ok(validate_with_dtd(&doc, &inline_dtd));
        }
      }
    }
    return Ok(vec![]);
  }

  let kind = detect_xml_schema_kind(xsd_clean, schema_format.as_deref());

  if kind == "dtd" {
    return match parse_dtd_declarations(xsd_clean) {
      Ok(dtd_schema) => Ok(validate_with_dtd(&doc, &dtd_schema)),
      Err(msg) => Ok(vec![XmlValidationError {
        path: "DTD Schema".to_string(),
        message: msg,
      }]),
    };
  }

  // Parse XML-based schema (XSD, RelaxNG, Schematron)
  let schema_doc = match parse_xml(xsd_clean) {
    Ok(d) => d,
    Err(e) => {
      return Ok(vec![XmlValidationError {
        path: "Schema Syntax".to_string(),
        message: format!("Ungültiges XML-Schema: {:?}", e),
      }]);
    }
  };

  match kind {
    "rng" => match compile_rng_grammar(&schema_doc) {
      Ok(grammar) => {
        let mut errs = Vec::new();
        if let Some(root_id) = doc.document_element() {
          validate_rng_element(&doc, root_id, &grammar.start, &grammar, "", &mut errs, 0);
        }
        Ok(errs)
      }
      Err(msg) => Ok(vec![XmlValidationError {
        path: "RelaxNG Schema".to_string(),
        message: msg,
      }]),
    },
    "schematron" => Ok(validate_schematron(xml_clean, &schema_doc)),
    _ => {
      // XSD 1.0 / 1.1 validation via uppsala
      let validator = match XsdValidator::from_schema(&schema_doc) {
        Ok(v) => v,
        Err(e) => {
          return Ok(vec![XmlValidationError {
            path: "XSD Schema".to_string(),
            message: format!("Fehler beim Kompilieren des XSD-Schemas: {:?}", e),
          }]);
        }
      };

      let errors = validator.validate(&doc);
      let mapped_errors = errors
        .into_iter()
        .map(|e| XmlValidationError {
          path: e.line.map(|l| format!("Zeile {}", l)).unwrap_or_else(|| "XML Schema".to_string()),
          message: e.message,
        })
        .collect();

      Ok(mapped_errors)
    }
  }
}

fn extract_launch_file_from_args(args: &[String]) -> Option<String> {
  let mut skip_next = false;
  for (idx, arg) in args.iter().enumerate().skip(1) {
    if skip_next {
      skip_next = false;
      continue;
    }
    if arg == "--position-x" || arg == "--position-y" {
      skip_next = true;
      continue;
    }

    let clean_arg = arg.trim().trim_matches('"').trim_matches('\'').trim();
    if !clean_arg.starts_with('-') && !clean_arg.starts_with('/') && !clean_arg.is_empty() {
      let path = std::path::Path::new(clean_arg);
      if path.exists() && path.is_file() {
        append_log("INFO", "LaunchArgs", &format!("Valid launch file detected [{}]", idx));
        return Some(clean_arg.to_string());
      }
    }
  }
  None
}

#[tauri::command]
fn get_launch_file() -> Option<String> {
  let args: Vec<String> = std::env::args().collect();
  extract_launch_file_from_args(&args)
}

#[tauri::command]
fn is_isolated_instance() -> bool {
  std::env::args().any(|arg| arg == "--new-instance")
}

/// Explicitly registers the Application User Model ID (AUMID) for the current process on Windows.
/// This ensures Windows taskbar groups all instances and windows of Fileditor together under a single
/// unified taskbar icon with multi-window thumbnail previews, rather than separating them into distinct icons.
#[cfg(target_os = "windows")]
pub fn set_app_user_model_id() {
  #[link(name = "shell32")]
  extern "system" {
    fn SetCurrentProcessExplicitAppUserModelID(AppID: *const u16) -> i32;
  }
  let app_id: Vec<u16> = "com.fileditor.app\0".encode_utf16().collect();
  unsafe {
    let res = SetCurrentProcessExplicitAppUserModelID(app_id.as_ptr());
    append_log("INFO", "AppUserModelID", &format!("SetCurrentProcessExplicitAppUserModelID result: {}", res));
  }
}

/// Fallback for non-Windows platforms.
#[cfg(not(target_os = "windows"))]
pub fn set_app_user_model_id() {}

#[tauri::command]
fn native_write_clipboard(text: String) -> Result<(), String> {
  #[cfg(target_os = "windows")]
  {
    use std::ptr;
    const CF_UNICODETEXT: u32 = 13;
    const GMEM_MOVEABLE: u32 = 0x0002;

    extern "system" {
      fn OpenClipboard(hWndNewOwner: *mut std::ffi::c_void) -> i32;
      fn CloseClipboard() -> i32;
      fn EmptyClipboard() -> i32;
      fn SetClipboardData(uFormat: u32, hMem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
      fn GlobalAlloc(uFlags: u32, dwBytes: usize) -> *mut std::ffi::c_void;
      fn GlobalLock(hMem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
      fn GlobalUnlock(hMem: *mut std::ffi::c_void) -> i32;
    }

    let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
    let bytes_len = wide.len() * std::mem::size_of::<u16>();

    unsafe {
      if OpenClipboard(ptr::null_mut()) == 0 {
        return Err("Failed to open Win32 clipboard".to_string());
      }
      EmptyClipboard();

      let h_mem = GlobalAlloc(GMEM_MOVEABLE, bytes_len);
      if h_mem.is_null() {
        CloseClipboard();
        return Err("Failed to allocate global memory for clipboard".to_string());
      }

      let p_mem = GlobalLock(h_mem) as *mut u16;
      if p_mem.is_null() {
        CloseClipboard();
        return Err("Failed to lock global memory for clipboard".to_string());
      }

      ptr::copy_nonoverlapping(wide.as_ptr(), p_mem, wide.len());
      GlobalUnlock(h_mem);

      if SetClipboardData(CF_UNICODETEXT, h_mem).is_null() {
        CloseClipboard();
        return Err("Failed to set Win32 clipboard data".to_string());
      }

      CloseClipboard();
    }
  }
  Ok(())
}

#[tauri::command]
async fn close_current_window(window: tauri::WebviewWindow) {
  append_log("INFO", "Window", &format!("close_current_window invoked for '{}' - destroying window", window.label()));
  if window.label() == "settings" {
    SETTINGS_DIRTY.store(false, Ordering::SeqCst);
  }
  let _ = window.destroy();
}

#[tauri::command]
fn set_settings_dirty(dirty: bool) {
  SETTINGS_DIRTY.store(dirty, Ordering::SeqCst);
}

#[tauri::command]
fn set_window_title(window: tauri::WebviewWindow, title: String) {
  let _ = window.set_title(&title);
}

/// Centers `window` inside the work area of `target_monitor` (handling multi-DPI scaling),
/// falling back to `window.center()` if no monitor metadata is available.
fn position_window_on_monitor(
  window: &tauri::WebviewWindow,
  target_monitor: Option<tauri::Monitor>,
  logical_w: f64,
  logical_h: f64,
) {
  if let Some(mon) = target_monitor {
    let work_area = mon.work_area();
    let sf = mon.scale_factor();
    let est_w = (logical_w * sf).round() as i32;
    let est_h = (logical_h * sf).round() as i32;
    let init_x = work_area.position.x + ((work_area.size.width as i32 - est_w) / 2).max(0);
    let init_y = work_area.position.y + ((work_area.size.height as i32 - est_h) / 2).max(0);
    let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
      x: init_x,
      y: init_y,
    }));
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(logical_w, logical_h)));
    if let Ok(outer) = window.outer_size() {
      let x = work_area.position.x + ((work_area.size.width as i32 - outer.width as i32) / 2).max(0);
      let y = work_area.position.y + ((work_area.size.height as i32 - outer.height as i32) / 2).max(0);
      let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
    }
  } else {
    let _ = window.center();
  }
}

/// Opens (or focuses) a native secondary window centered on the caller window's current monitor.
fn open_or_focus_child_window(
  app: &AppHandle,
  caller: &tauri::WebviewWindow,
  label: &str,
  url_path: &str,
  title: String,
  inner_size: (f64, f64),
  min_size: (f64, f64),
  bg_color: tauri::window::Color,
) -> Result<(), String> {
  if let Some(existing) = app.get_webview_window(label) {
    let _ = existing.set_title(&title);
    let win_clone = existing.clone();
    let _ = app.run_on_main_thread(move || {
      force_focus_window(&win_clone);
    });
    return Ok(());
  }

  let caller_monitor = caller.current_monitor().ok().flatten();
  append_log("INFO", "Window", &format!("Creating native '{}' window", label));

  let win = tauri::WebviewWindowBuilder::new(
    app,
    label,
    tauri::WebviewUrl::App(url_path.into()),
  )
  .title(&title)
  .inner_size(inner_size.0, inner_size.1)
  .min_inner_size(min_size.0, min_size.1)
  .resizable(true)
  .decorations(true)
  .visible(false)
  .background_color(bg_color)
  .build()
  .map_err(|e| e.to_string())?;

  let win_clone = win.clone();
  let (w, h) = inner_size;
  let _ = app.run_on_main_thread(move || {
    position_window_on_monitor(&win_clone, caller_monitor, w, h);
    force_focus_window(&win_clone);
  });
  Ok(())
}

#[tauri::command]
async fn open_settings_window(
  app: AppHandle,
  window: tauri::WebviewWindow,
  title: Option<String>,
) -> Result<(), String> {
  if app.get_webview_window("settings").is_none() {
    SETTINGS_DIRTY.store(false, Ordering::SeqCst);
  }
  let window_title = title.unwrap_or_else(|| "Einstellungen".to_string());
  open_or_focus_child_window(
    &app,
    &window,
    "settings",
    "index.html?window=settings",
    window_title,
    (860.0, 640.0),
    (600.0, 440.0),
    tauri::window::Color(9, 13, 22, 255),
  )
}

#[tauri::command]
async fn open_about_window(
  app: AppHandle,
  window: tauri::WebviewWindow,
  title: Option<String>,
) -> Result<(), String> {
  let window_title = title.unwrap_or_else(|| "Über Fileditor".to_string());
  open_or_focus_child_window(
    &app,
    &window,
    "about",
    "index.html?window=about",
    window_title,
    (560.0, 560.0),
    (480.0, 420.0),
    tauri::window::Color(11, 16, 27, 255),
  )
}

#[cfg(target_os = "windows")]
pub fn force_focus_window(window: &tauri::WebviewWindow) {
  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();

  extern "system" {
    fn GetForegroundWindow() -> *mut std::ffi::c_void;
    fn GetWindowThreadProcessId(hWnd: *mut std::ffi::c_void, lpdwProcessId: *mut u32) -> u32;
    fn AttachThreadInput(idAttach: u32, idAttachTo: u32, fAttach: i32) -> i32;
    fn SetForegroundWindow(hWnd: *mut std::ffi::c_void) -> i32;
    fn BringWindowToTop(hWnd: *mut std::ffi::c_void) -> i32;
    fn SwitchToThisWindow(hWnd: *mut std::ffi::c_void, fUnknown: i32);
    fn SetWindowPos(
      hWnd: *mut std::ffi::c_void,
      hWndInsertAfter: *mut std::ffi::c_void,
      X: i32,
      Y: i32,
      cx: i32,
      cy: i32,
      uFlags: u32,
    ) -> i32;
    fn GetCurrentThreadId() -> u32;
  }

  if let Ok(hwnd) = window.hwnd() {
    unsafe {
      let raw = hwnd.0 as *mut std::ffi::c_void;
      const HWND_TOPMOST: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;
      const HWND_NOTOPMOST: *mut std::ffi::c_void = -2isize as *mut std::ffi::c_void;
      const SWP_NOMOVE: u32 = 0x0002;
      const SWP_NOSIZE: u32 = 0x0001;
      const SWP_SHOWWINDOW: u32 = 0x0040;

      let fg_window = GetForegroundWindow();
      let current_thread = GetCurrentThreadId();
      let fg_thread = if !fg_window.is_null() {
        GetWindowThreadProcessId(fg_window, std::ptr::null_mut())
      } else {
        0
      };

      if fg_thread != 0 && fg_thread != current_thread {
        AttachThreadInput(current_thread, fg_thread, 1);
      }

      SetWindowPos(raw, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);
      BringWindowToTop(raw);
      SetForegroundWindow(raw);
      SwitchToThisWindow(raw, 1);
      SetWindowPos(raw, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

      if fg_thread != 0 && fg_thread != current_thread {
        AttachThreadInput(current_thread, fg_thread, 0);
      }
    }
  }
}

#[cfg(not(target_os = "windows"))]
pub fn force_focus_window(window: &tauri::WebviewWindow) {
  let _ = window.unminimize();
  let _ = window.show();
  let _ = window.set_focus();
}

#[tauri::command]
async fn focus_current_window(window: tauri::WebviewWindow) {
  let app = window.app_handle().clone();
  let win_clone = window.clone();
  let _ = app.run_on_main_thread(move || {
    force_focus_window(&win_clone);
  });
}

#[tauri::command]
fn spawn_new_instance(
  content: String,
  filename: String,
  path: Option<String>,
  x: Option<i32>,
  y: Option<i32>,
) -> Result<(), String> {
  use std::fs;
  use std::process::Command;

  let safe_filename = std::path::Path::new(&filename)
    .file_name()
    .map(|n| n.to_string_lossy().to_string())
    .filter(|s| !s.is_empty() && s != "." && s != "..")
    .unwrap_or_else(|| "untitled.txt".to_string());

  let file_to_open: String = if let Some(ref p) = path {
    let clean = p.trim().trim_matches('"').trim_matches('\'').trim();
    if !clean.is_empty() && std::path::Path::new(clean).exists() {
      clean.to_string()
    } else {
      let temp_dir = std::env::temp_dir().join("fileditor_temp");
      let _ = fs::create_dir_all(&temp_dir);
      let temp_file_path = temp_dir.join(&safe_filename);
      let _ = fs::write(&temp_file_path, content);
      temp_file_path.to_string_lossy().to_string()
    }
  } else {
    let temp_dir = std::env::temp_dir().join("fileditor_temp");
    let _ = fs::create_dir_all(&temp_dir);
    let temp_file_path = temp_dir.join(&safe_filename);
    let _ = fs::write(&temp_file_path, content);
    temp_file_path.to_string_lossy().to_string()
  };

  #[cfg(target_os = "windows")]
  {
    extern "system" {
      fn AllowSetForegroundWindow(dwProcessId: u32) -> i32;
    }
    const ASFW_ANY: u32 = 0xFFFFFFFF;
    unsafe {
      AllowSetForegroundWindow(ASFW_ANY);
    }
  }

  if let Ok(current_exe) = std::env::current_exe() {
    let mut cmd = Command::new(current_exe);
    cmd.arg("--new-instance");
    if let (Some(px), Some(py)) = (x, y) {
      cmd.arg("--position-x").arg(px.to_string());
      cmd.arg("--position-y").arg(py.to_string());
    }
    cmd.arg(&file_to_open);
    if let Ok(child) = cmd.spawn() {
      #[cfg(target_os = "windows")]
      {
        extern "system" {
          fn AllowSetForegroundWindow(dwProcessId: u32) -> i32;
        }
        unsafe {
          AllowSetForegroundWindow(child.id());
        }
      }
    }
  }
  Ok(())
}

#[tauri::command]
fn show_in_explorer(path: String) -> Result<(), String> {
  use std::os::windows::process::CommandExt;
  use std::process::Command;

  let mut clean_path = path.replace('/', "\\");
  if clean_path.starts_with(r"\\?\") {
    clean_path = clean_path[4..].to_string();
  }

  let p = std::path::Path::new(&clean_path);
  if p.exists() {
    if p.is_file() {
      let raw = format!("/select,\"{}\"", clean_path);
      Command::new("explorer.exe")
        .raw_arg(raw)
        .spawn()
        .map_err(|e| e.to_string())?;
    } else {
      Command::new("explorer.exe")
        .arg(&clean_path)
        .spawn()
        .map_err(|e| e.to_string())?;
    }
  } else if let Some(parent) = p.parent() {
    let parent_str = parent.to_string_lossy();
    Command::new("explorer.exe")
      .arg(&*parent_str)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn is_allowed_external_url(url: &str) -> bool {
  let trimmed = url.trim();
  if trimmed.is_empty() || trimmed.chars().any(|c| c.is_control()) {
    return false;
  }
  let lower = trimmed.to_ascii_lowercase();
  lower.starts_with("https://") || lower.starts_with("http://")
}

fn is_blocked_executable_path(path: &std::path::Path) -> bool {
  let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
    return false;
  };
  matches!(
    ext.to_ascii_lowercase().as_str(),
    "exe"
      | "bat"
      | "cmd"
      | "com"
      | "scr"
      | "pif"
      | "vbs"
      | "vbe"
      | "js"
      | "jse"
      | "wsf"
      | "wsh"
      | "ps1"
      | "psm1"
      | "msi"
      | "msp"
      | "hta"
      | "cpl"
      | "reg"
      | "lnk"
      | "jar"
      | "scf"
  )
}

#[cfg(target_os = "windows")]
fn win32_shell_open(target: &str) -> Result<(), String> {
  #[link(name = "shell32")]
  extern "system" {
    fn ShellExecuteW(
      hwnd: *mut std::ffi::c_void,
      lpOperation: *const u16,
      lpFile: *const u16,
      lpParameters: *const u16,
      lpDirectory: *const u16,
      nShowCmd: i32,
    ) -> isize;
  }

  const SW_SHOWNORMAL: i32 = 1;
  let op: Vec<u16> = "open\0".encode_utf16().collect();
  let file_wide: Vec<u16> = target.encode_utf16().chain(std::iter::once(0)).collect();

  let code = unsafe {
    ShellExecuteW(
      std::ptr::null_mut(),
      op.as_ptr(),
      file_wide.as_ptr(),
      std::ptr::null(),
      std::ptr::null(),
      SW_SHOWNORMAL,
    )
  };

  if code <= 32 {
    Err(format!("ShellExecuteW failed with code {}", code))
  } else {
    Ok(())
  }
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
  let clean_url = url.trim().to_string();
  if !is_allowed_external_url(&clean_url) {
    append_log("WARN", "Browser", &format!("Blocked disallowed external URL scheme: {}", clean_url));
    return Err("Only http:// and https:// URLs are permitted.".to_string());
  }

  append_log("INFO", "Browser", &format!("Opening external URL in system browser: {}", clean_url));
  #[cfg(target_os = "windows")]
  {
    win32_shell_open(&clean_url)?;
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&clean_url)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(&clean_url)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

#[tauri::command]
fn open_file_with_default_app(path: String) -> Result<(), String> {
  let clean_path = path.replace('/', "\\").trim().trim_matches('"').trim_matches('\'').to_string();
  if clean_path.is_empty() || clean_path.chars().any(|c| c.is_control()) {
    return Err("Invalid file path.".to_string());
  }

  let file_path = std::path::Path::new(&clean_path);
  if !file_path.exists() || !file_path.is_file() {
    return Err("Target file does not exist.".to_string());
  }

  if is_blocked_executable_path(file_path) {
    append_log("WARN", "FileSystem", &format!("Blocked direct execution of executable/script file: {}", clean_path));
    return Err("BLOCKED_EXECUTABLE".to_string());
  }

  append_log("INFO", "FileSystem", &format!("Opening file with system default application: {}", clean_path));

  #[cfg(target_os = "windows")]
  {
    win32_shell_open(&clean_path)?;
  }
  #[cfg(target_os = "macos")]
  {
    std::process::Command::new("open")
      .arg(&clean_path)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
  {
    std::process::Command::new("xdg-open")
      .arg(&clean_path)
      .spawn()
      .map_err(|e| e.to_string())?;
  }
  Ok(())
}

fn run_tauri_app(enable_single_instance: bool) {
  let mut builder = tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init());

  if enable_single_instance {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      append_log("INFO", "SingleInstance", "Secondary launch forwarded via single-instance plugin.");
      if let Some(file_path) = extract_launch_file_from_args(&argv) {
        let _ = app.emit("single-instance-file", file_path);
      }
      if let Some(window) = app.get_webview_window("main") {
        force_focus_window(&window);
      }
    }));
  }

  builder
    .on_window_event(|window, event| {
      if window.label() == "settings" {
        match event {
          tauri::WindowEvent::CloseRequested { api, .. } => {
            if SETTINGS_DIRTY.load(Ordering::SeqCst) {
              api.prevent_close();
              let _ = window.emit("settings-confirm-close", ());
            }
          }
          tauri::WindowEvent::Destroyed => {
            SETTINGS_DIRTY.store(false, Ordering::SeqCst);
          }
          _ => {}
        }
      } else if window.label() == "main" {
        if matches!(event, tauri::WindowEvent::Destroyed) {
          for lbl in ["settings", "about"] {
            if let Some(child) = window.app_handle().get_webview_window(lbl) {
              let _ = child.destroy();
            }
          }
        }
      }
    })
    .invoke_handler(tauri::generate_handler![
      open_file_dialog,
      save_file_dialog,
      read_file,
      write_file,
      get_file_modified_time,
      file_exists,
      close_app,
      close_current_window,
      set_settings_dirty,
      set_window_title,
      open_settings_window,
      open_about_window,
      focus_current_window,
      validate_xml_schema,
      get_launch_file,
      is_isolated_instance,
      spawn_new_instance,
      show_in_explorer,
      open_external_url,
      open_file_with_default_app,
      write_log,
      get_log_path,
      native_write_clipboard
    ])
    .setup(move |app| {
      append_log("INFO", "Backend", &format!("Fileditor v{} backend started successfully.", env!("CARGO_PKG_VERSION")));
      let app_handle = app.handle().clone();

      // Check if position was specified via CLI arguments (e.g. from tab drag out)
      let args: Vec<String> = std::env::args().collect();
      let mut pos_x: Option<i32> = None;
      let mut pos_y: Option<i32> = None;
      for (idx, arg) in args.iter().enumerate() {
        if arg == "--position-x" && idx + 1 < args.len() {
          pos_x = args[idx + 1].parse().ok();
        } else if arg == "--position-y" && idx + 1 < args.len() {
          pos_y = args[idx + 1].parse().ok();
        }
      }

      if let (Some(x), Some(y)) = (pos_x, pos_y) {
        if let Some(window) = app_handle.get_webview_window("main") {
          let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition { x, y }));
        }
      }

      // Ensure window is brought immediately into the foreground
      if let Some(window) = app_handle.get_webview_window("main") {
        force_focus_window(&window);
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

pub fn run() {
  set_app_user_model_id();

  let args: Vec<String> = std::env::args().collect();
  let is_new_instance = args.iter().any(|arg| arg == "--new-instance");

  if is_new_instance {
    append_log("INFO", "Launch", "Starting as an independent new instance (--new-instance flag detected).");
    run_tauri_app(false);
  } else {
    run_tauri_app(true);
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn xml_validation_xsd_valid_and_invalid() {
    let xml_ok = r#"<?xml version="1.0" encoding="UTF-8"?>
<Projektname Prioritaet="Kritisch" Budget_in_Mio_USD="4500" Aktiv="true">
  <System_Settings>
    <Verschluesselung>true</Verschluesselung>
    <Sync_Intervall_Sekunden>300</Sync_Intervall_Sekunden>
    <Backup_Server>Earth-Backup-01</Backup_Server>
  </System_Settings>
</Projektname>"#;

    let xsd = r#"<?xml version="1.0" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema">
  <xs:element name="Projektname">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="System_Settings">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="Verschluesselung" type="xs:boolean"/>
              <xs:element name="Sync_Intervall_Sekunden">
                <xs:simpleType>
                  <xs:restriction base="xs:integer">
                    <xs:minInclusive value="10"/>
                    <xs:maxInclusive value="3600"/>
                  </xs:restriction>
                </xs:simpleType>
              </xs:element>
              <xs:element name="Backup_Server" type="xs:string" minOccurs="0"/>
            </xs:sequence>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
      <xs:attribute name="Prioritaet" type="xs:string" use="required"/>
      <xs:attribute name="Budget_in_Mio_USD" type="xs:integer" use="required"/>
      <xs:attribute name="Aktiv" type="xs:boolean" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>"#;

    let errs_ok = validate_xml_schema(xml_ok.to_string(), xsd.to_string(), Some("auto".into())).unwrap();
    assert!(errs_ok.is_empty(), "Expected valid XML, got: {:?}", errs_ok.iter().map(|e| &e.message).collect::<Vec<_>>());

    let xml_bad = xml_ok.replace("300", "5");
    let errs_bad = validate_xml_schema(xml_bad, xsd.to_string(), Some("auto".into())).unwrap();
    assert!(!errs_bad.is_empty(), "Expected validation error for out-of-range Sync_Intervall_Sekunden");
  }

  #[test]
  fn dtd_detection_with_xml_pi_and_validation() {
    let dtd = r#"<?xml version="1.0" encoding="UTF-8"?>
<!ELEMENT note (to, from, body)>
<!ELEMENT to (#PCDATA)>
<!ELEMENT from (#PCDATA)>
<!ELEMENT body (#PCDATA)>
<!ATTLIST note id ID #REQUIRED>"#;

    assert_eq!(detect_xml_schema_kind(dtd, None), "dtd");

    let valid = "\u{FEFF}<note id=\"n1\"><to>A</to><from>B</from><body>C</body></note>";
    let errs_ok = validate_xml_schema(valid.to_string(), dtd.to_string(), None).unwrap();
    assert!(errs_ok.is_empty(), "Expected valid DTD XML, got: {:?}", errs_ok.iter().map(|e| &e.message).collect::<Vec<_>>());

    let missing_attr = "<note><to>A</to><from>B</from><body>C</body></note>";
    let errs_bad = validate_xml_schema(missing_attr.to_string(), dtd.to_string(), None).unwrap();
    assert!(!errs_bad.is_empty());
  }

  #[test]
  fn rng_validation_catches_unexpected_attr_empty_ref_and_optional_data() {
    let rng = r#"<grammar xmlns="http://relaxng.org/ns/structure/1.0">
  <start>
    <element name="root">
      <element name="emptyRef"><ref name="nothing"/></element>
      <element name="optNum"><optional><data type="integer"/></optional></element>
    </element>
  </start>
  <define name="nothing"><empty/></define>
</grammar>"#;

    let valid = r#"<root><emptyRef/><optNum>42</optNum></root>"#;
    let errs_ok = validate_xml_schema(valid.to_string(), rng.to_string(), Some("auto".into())).unwrap();
    assert!(errs_ok.is_empty(), "Expected valid RNG XML, got: {:?}", errs_ok.iter().map(|e| &e.message).collect::<Vec<_>>());

    let bad_attr = r#"<root extra="nope"><emptyRef/><optNum>42</optNum></root>"#;
    let errs_attr = validate_xml_schema(bad_attr.to_string(), rng.to_string(), Some("auto".into())).unwrap();
    assert!(!errs_attr.is_empty(), "Expected error on unexpected attribute");

    let bad_empty_ref = r#"<root><emptyRef>text</emptyRef><optNum>42</optNum></root>"#;
    let errs_empty = validate_xml_schema(bad_empty_ref.to_string(), rng.to_string(), Some("auto".into())).unwrap();
    assert!(!errs_empty.is_empty(), "Expected error on text inside <ref name='nothing'/> (<empty/>)");

    let bad_opt_num = r#"<root><emptyRef/><optNum>abc</optNum></root>"#;
    let errs_opt = validate_xml_schema(bad_opt_num.to_string(), rng.to_string(), Some("auto".into())).unwrap();
    assert!(!errs_opt.is_empty(), "Expected error on invalid optional integer");
  }

  #[test]
  fn schematron_validation_works() {
    let sch = r#"<schema xmlns="http://purl.oclc.org/dsdl/schematron">
  <pattern>
    <rule context="Meilenstein">
      <assert test="@Abgeschlossen = 'true' or @Abgeschlossen = 'false'">Abgeschlossen muss boolean sein</assert>
    </rule>
  </pattern>
</schema>"#;
    let xml_ok = r#"<Root><Meilenstein Abgeschlossen="true"/></Root>"#;
    let errs_ok = validate_xml_schema(xml_ok.to_string(), sch.to_string(), Some("auto".into())).unwrap();
    assert!(errs_ok.is_empty());

    let xml_bad = r#"<Root><Meilenstein Abgeschlossen="maybe"/></Root>"#;
    let errs_bad = validate_xml_schema(xml_bad.to_string(), sch.to_string(), Some("auto".into())).unwrap();
    assert!(!errs_bad.is_empty());
  }

  #[test]
  fn security_url_and_executable_guards_work() {
    assert!(is_allowed_external_url("https://nativeproduction.de"));
    assert!(is_allowed_external_url("http://localhost:3000"));
    assert!(!is_allowed_external_url("javascript:alert(1)"));
    assert!(!is_allowed_external_url("file:///C:/Windows/System32/cmd.exe"));
    assert!(!is_allowed_external_url("cmd /c calc.exe"));
    assert!(!is_allowed_external_url("https://example.com\nmalicious"));

    assert!(is_blocked_executable_path(std::path::Path::new("C:\\test\\payload.exe")));
    assert!(is_blocked_executable_path(std::path::Path::new("C:\\test\\script.bat")));
    assert!(is_blocked_executable_path(std::path::Path::new("C:\\test\\script.ps1")));
    assert!(!is_blocked_executable_path(std::path::Path::new("C:\\test\\report.pdf")));
    assert!(!is_blocked_executable_path(std::path::Path::new("C:\\test\\diagram.png")));
  }
}
