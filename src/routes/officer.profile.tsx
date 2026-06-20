import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/use-auth";

export const Route = createFileRoute("/officer/profile")({
  component: Profile,
});

function Profile() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <div className="p-4 space-y-4">
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold mb-3">
          {(profile.full_name ?? profile.email)[0].toUpperCase()}
        </div>
        <h1 className="text-lg font-semibold">{profile.full_name ?? "Officer"}</h1>
        <p className="text-sm text-muted-foreground">{profile.email}</p>
        <div className="mt-3 inline-block text-xs uppercase tracking-wide bg-surface-2 px-2 py-1 rounded">{profile.role}</div>
      </div>
      <button onClick={signOut} className="w-full rounded-full bg-surface-2 border border-border py-3 text-sm hover:bg-[#262a36]">
        Sign out
      </button>
    </div>
  );
}