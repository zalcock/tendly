"use client"

import { toast } from "sonner"
import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Button 
        onClick={() => toast.success("Tendygov Online", {
          description: "UI Components and Sonner are ready."
        })}
      >
        Check System Status
      </Button>
    </div>
  )
}