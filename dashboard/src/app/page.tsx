import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, BarChart3, ShoppingCart, Target, Zap } from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      {/* Navigation */}
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-8 w-8 text-primary" />
            <span className="font-bold text-xl">Attribution Bridge</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Know Where Your Customers
          <br />
          <span className="text-primary">Really</span> Come From
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          First-party attribution tracking for WooCommerce. See your true ROAS,
          track conversions that GA4 misses, and make smarter marketing
          decisions.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/register">
            <Button size="lg" className="gap-2">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="#features">
            <Button size="lg" variant="outline">
              Learn More
            </Button>
          </Link>
        </div>
      </section>

      {/* Stats Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          <div className="text-center p-6 rounded-lg bg-card border">
            <div className="text-4xl font-bold text-primary mb-2">48%</div>
            <div className="text-muted-foreground">
              Of conversions missed by GA4
            </div>
          </div>
          <div className="text-center p-6 rounded-lg bg-card border">
            <div className="text-4xl font-bold text-primary mb-2">3.2x</div>
            <div className="text-muted-foreground">
              Average ROAS improvement
            </div>
          </div>
          <div className="text-center p-6 rounded-lg bg-card border">
            <div className="text-4xl font-bold text-primary mb-2">15min</div>
            <div className="text-muted-foreground">
              Setup time for WooCommerce
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="container mx-auto px-4 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">
          Everything You Need for Marketing Attribution
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <FeatureCard
            icon={<ShoppingCart className="h-10 w-10" />}
            title="WooCommerce Native"
            description="Deep integration with WooCommerce. Capture every order with full attribution data."
          />
          <FeatureCard
            icon={<Target className="h-10 w-10" />}
            title="Server-Side Tracking"
            description="Bypass ad blockers with server-side conversion APIs for Meta, Google, and TikTok."
          />
          <FeatureCard
            icon={<BarChart3 className="h-10 w-10" />}
            title="True ROAS Metrics"
            description="See new customer vs returning customer ROAS. Know your real acquisition costs."
          />
          <FeatureCard
            icon={<Zap className="h-10 w-10" />}
            title="Post-Purchase Surveys"
            description="Capture attribution data that pixels miss with customizable surveys."
          />
          <FeatureCard
            icon={<Target className="h-10 w-10" />}
            title="Multi-Touch Attribution"
            description="First touch, last touch, or linear models. Understand the full customer journey."
          />
          <FeatureCard
            icon={<BarChart3 className="h-10 w-10" />}
            title="Unified Dashboard"
            description="All your stores and ad platforms in one place. Real-time metrics and insights."
          />
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <div className="bg-primary text-primary-foreground rounded-2xl p-12 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to See Your True Marketing Performance?
          </h2>
          <p className="text-lg mb-8 opacity-90">
            Start your free trial today. No credit card required.
          </p>
          <Link href="/register">
            <Button size="lg" variant="secondary" className="gap-2">
              Get Started Free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground">
          <p>&copy; 2025 Attribution Bridge. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-lg bg-card border hover:shadow-lg transition-shadow">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
