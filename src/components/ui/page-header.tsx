interface PageHeaderProps {
  title: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {actions && <div className="flex items-center gap-1.5">{actions}</div>}
    </div>
  );
}
