import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const currentRole = user.restaurants[0]?.role || "N/A";
  const currentRestaurant = user.restaurants[0]?.restaurant;

  return (
    <div className="min-h-screen bg-surface-muted p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            User Profile
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage your personal account details.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Personal Information</CardTitle>
            <CardDescription>
              Your basic account details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={user.name} disabled />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input value={user.email} disabled />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Input value={currentRole} disabled />
              </div>
              <div className="space-y-2">
                <Label>Primary Restaurant</Label>
                <Input value={currentRestaurant?.name || "None"} disabled />
              </div>
            </div>
            
            <div className="bg-primary/5 p-4 rounded-md border border-primary/20 text-sm text-muted-foreground mt-4">
              Your account profile details are managed by your organization administrator.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
