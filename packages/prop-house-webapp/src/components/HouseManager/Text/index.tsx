import clsx from 'clsx';
import classes from './Text.module.css';

interface TextProps {
  type: 'heading' | 'title' | 'subtitle' | 'body' | 'link' | 'error';
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

const Text: React.FC<TextProps> = ({ type, disabled, onClick, children }) => {
  return type === 'link' ? (
    <div onClick={onClick} className={clsx(classes.link, disabled && classes.disabled)}>
      {children}
    </div>
  ) : (
    <p className={clsx(classes[type], disabled && classes.disabled)}>{children}</p>
  );
};

export default Text;
