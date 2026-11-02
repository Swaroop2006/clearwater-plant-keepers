import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, BarChart3, ClipboardList, Package, ShieldCheck, Truck, Users } from "lucide-react";
import heroImg from "@/assets/water-plant-hero.jpg";
import { Logo } from "@/components/app/ui-bits";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Water Plant Management System — Deliveries, Stock & Staff" },
      {
        name: "description",
        content: "Run your water supply business: customers, delivery staff, priority delivery tasks, can & packet stock, and reports in one place.",
      },
      { property: "og:title", content: "Water Plant Management System" },
      { property: "og:description", content: "Customers, delivery tasks, inventory and reports for water supply businesses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: Users, title: "Customers", text: "Profiles, pricing and full delivery history." },
  { icon: ClipboardList, title: "Priority tasks", text: "Each worker gets a queue in priority order." },
  { icon: Truck, title: "Live tracking", text: "Start and finish times with real durations." },
  { icon: Package, title: "Inventory", text: "Cans, packets and empty-can returns tracked." },
  { icon: BarChart3, title: "Reports", text: "Daily and monthly figures with CSV export." },
  { icon: ShieldCheck, title: "Secure roles", text: "Admin and staff see only what they should." },
];

function Landing() {
  return (
    <div className="min-h-screen bg-sky">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <div className="flex gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/login/employee">Employee login</Link>
          </Button>
          <Button asChild variant="navy" size="sm">
            <Link to="/login/admin">Admin login</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-6 pb-14 sm:px-6 lg:grid-cols-2 lg:pt-12">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ripple rounded-full bg-primary" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
            For water supply businesses
          </span>
          <h1 className="mt-5 text-4xl leading-tight font-semibold text-foreground sm:text-5xl">
            Every can, every customer, <span className="text-water">every delivery.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted-foreground">
            Water Plant Management System keeps your customers, delivery staff, daily tasks and stock in one place —
            so you always know what was delivered, by whom, and what is left in the plant.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <LoginCard
              to="/login/admin"
              tone="navy"
              title="Admin Login"
              text="Owner and managers: dashboard, customers, staff, stock and reports."
              icon={ShieldCheck}
            />
            <LoginCard
              to="/login/employee"
              tone="water"
              title="Employee Login"
              text="Delivery staff: your tasks, start and finish deliveries, history."
              icon={Truck}
            />
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-4 -z-10 rounded-[2rem] bg-water opacity-20 blur-2xl" />
          <img
            src={heroImg}
            alt="Blue water cans moving along a filling line in a clean water plant"
            width={1600}
            height={1008}
            className="aspect-[4/3] w-full rounded-3xl object-cover shadow-card"
          />
        </div>
      </section>

      <section className="border-t bg-card/60">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex gap-3 rounded-2xl p-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-primary">
                <f.icon className="size-5" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{f.title}</p>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-muted-foreground">
        First time here?{" "}
        <Link to="/setup" className="font-semibold text-primary hover:underline">
          Set up the administrator account
        </Link>
      </footer>
    </div>
  );
}

function LoginCard({
  to,
  title,
  text,
  icon: Icon,
  tone,
}: {
  to: "/login/admin" | "/login/employee";
  title: string;
  text: string;
  icon: typeof Truck;
  tone: "navy" | "water";
}) {
  return (
    <Link
      to={to}
      className={
        "group flex flex-col gap-3 rounded-2xl p-5 text-primary-foreground shadow-card transition-transform hover:-translate-y-1 " +
        (tone === "navy" ? "bg-deep" : "bg-water")
      }
    >
      <div className="grid size-11 place-items-center rounded-xl bg-primary-foreground/15">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="font-display text-lg font-semibold">{title}</p>
        <p className="mt-1 text-sm opacity-85">{text}</p>
      </div>
      <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold">
        Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
      </span>
    </Link>
  );
}
