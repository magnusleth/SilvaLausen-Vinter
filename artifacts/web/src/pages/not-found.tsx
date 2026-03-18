import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="max-w-md w-full text-center space-y-6 p-8">
        <div className="flex justify-center">
          <div className="w-20 h-20 bg-destructive/10 rounded-full flex items-center justify-center">
            <AlertCircle className="w-10 h-10 text-destructive" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-display font-bold text-foreground">Siden blev ikke fundet</h1>
          <p className="text-muted-foreground">Den side du leder efter eksisterer ikke, eller du har ikke adgang til den.</p>
        </div>
        <Link href="/dashboard">
          <Button size="lg" className="w-full mt-4">
            Tilbage til Dashboard
          </Button>
        </Link>
      </div>
    </div>
  );
}
