import React, { useState } from 'react';
import { Tooltip, TooltipProps } from 'antd';

export const ClickableTooltip: React.FC<TooltipProps> = ({ children, title, ...props }) => {
  const [open, setOpen] = useState(false);

  if (!title) {
    return <>{children}</>;
  }

  return (
    <Tooltip
      title={title}
      open={open}
      onOpenChange={(newOpen) => setOpen(newOpen)}
      {...props}
    >
      <span
        onClickCapture={() => setOpen(false)}
        className='inline-flex cursor-pointer'
      >
        {children}
      </span>
    </Tooltip>
  );
};
