import { invokeTauriSafe } from "./tauriBridge";

const formatTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const logger = {
  info: (component: string, message: string) => {
    const time = formatTime();
    const logStr = `[${time}] [INFO] [${component}] ${message}`;
    console.log(logStr);
    invokeTauriSafe("write_log", { level: "INFO", component, message });
  },

  warn: (component: string, message: string) => {
    const time = formatTime();
    const logStr = `[${time}] [WARNING] [${component}] ${message}`;
    console.warn(logStr);
    invokeTauriSafe("write_log", { level: "WARNING", component, message });
  },

  error: (component: string, message: string, errorStack?: string) => {
    const time = formatTime();
    const fullMsg = errorStack ? `${message} | Stack: ${errorStack}` : message;
    const logStr = `[${time}] [ERROR] [${component}] ${fullMsg}`;
    console.error(logStr);
    invokeTauriSafe("write_log", { level: "ERROR", component, message: fullMsg });
  }
};
