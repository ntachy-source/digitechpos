import { ReactNode, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Package, ScanLine, BarChart3, LogOut, ShieldCheck, ScanBarcode, Menu, FileText, KeyRound, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "staff"] as const },
  { to: "/pos", label: "Point of Sale", icon: ScanLine, roles: ["admin", "staff"] as const },
  { to: "/inventory", label: "Inventory", icon: Package, roles: ["admin"] as const },
  { to: "/invoices", label: "Invoices", icon: FileText, roles: ["admin", "staff"] as const },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] as const },
  { to: "/licenses", label: "Licenses", icon: KeyRound, roles: ["admin"] as const },
  { to: "/settings", label: "Settings", icon: SettingsIcon, roles: ["admin"] as const },
];

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [openMobile, setOpenMobile] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="h-16 flex items-center gap-2 px-6 border-b border-sidebar-border">
        <div className="h-9 w-9 rounded-lg bg-gradient-primary flex items-center justify-center">
          <ScanBarcode className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold tracking-tight">SGH POS</p>
          <p className="text-xs text-muted-foreground">Gadget Store</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {navItems.filter(n => role && (n.roles as readonly string[]).includes(role)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-card"
                : "text-sidebar-foreground hover:bg-sidebar-accent"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border space-y-2">
        <div className="flex items-center gap-2 px-3 py-2 text-xs">
          <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium">{user?.email}</p>
            <p className="text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-gradient-subtle">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col">
        <SidebarContent />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <header className="md:hidden h-14 flex items-center justify-between px-4 border-b border-border bg-background/80 backdrop-blur sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-primary flex items-center justify-center">
              <ScanBarcode className="h-4 w-4 text-primary-foreground" />
            </div>
            <p className="font-semibold tracking-tight">SGH POS</p>
          </div>
          <Sheet open={openMobile} onOpenChange={setOpenMobile}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContent onNavigate={() => setOpenMobile(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto w-full">{children}</div>
        </main>
      </div>
    </div>
  );
};
