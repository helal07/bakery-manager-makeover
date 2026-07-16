import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Save, Trash2, User, Shield, Globe } from "lucide-react";
import { AppShell, Card } from "@/components/app-shell";
import { getProfile, saveProfile, type UserProfile } from "@/lib/profile-settings";
import { uploadImage } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [{ title: "My Profile · Muzahid Food" }] }),
  component: ProfilePage,
});

type Section = "account" | "security" | "preferences";

function ProfilePage() {
  const [section, setSection] = useState<Section>("account");
  const [profile, setProfile] = useState<UserProfile>({
    name: "", email: "", phone: "", bio: "", language: "en", timezone: "Asia/Dhaka",
  });
  const [pw, setPw] = useState({ curr: "", next: "", conf: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { getProfile().then(setProfile).catch(() => {}); }, []);

  const initials = useMemo(
    () => profile.name.split(" ").map(s => s[0]).slice(0, 2).join("").toUpperCase(),
    [profile.name],
  );

  const save = async () => {
    if (!profile.name.trim()) return toast.error("Name is required");
    try {
      await saveProfile(profile);
      window.dispatchEvent(new Event("user-profile-updated"));
      toast.success("Profile updated");
    } catch (e) { toast.error((e as Error).message); }
  };

  const onAvatar = async (f?: File) => {
    if (!f) return;
    try {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? "me";
      const { url } = await uploadImage("customer-avatars", uid, f);
      const next = { ...profile, avatarDataUrl: url };
      setProfile(next);
      await saveProfile(next);
      window.dispatchEvent(new Event("user-profile-updated"));
      toast.success("Photo uploaded");
    } catch (e) { toast.error((e as Error).message); }
  };

  const updatePw = async () => {
    if (pw.next.length < 6) return toast.error("Password must be at least 6 characters");
    if (pw.next !== pw.conf) return toast.error("Passwords do not match");
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    if (error) return toast.error(error.message);
    setPw({ curr: "", next: "", conf: "" });
    toast.success("Password updated");
  };

  const NAV: { id: Section; label: string; icon: any }[] = [
    { id: "account", label: "Account", icon: User },
    { id: "security", label: "Security", icon: Shield },
    { id: "preferences", label: "Preferences", icon: Globe },
  ];

  return (
    <AppShell title="My Profile" subtitle="Manage your account information">
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-5">
        <Card className="p-2 h-fit">
          <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Your account</div>
          <div className="space-y-0.5">
            {NAV.map(it => {
              const Icon = it.icon;
              const active = section === it.id;
              return (
                <button key={it.id} onClick={() => setSection(it.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${active ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}>
                  <Icon className="size-4" /> {it.label}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-5">
          {section === "account" && (
            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Account</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Your personal information visible across the app</p>
              </div>
              <div className="flex items-center gap-4 pb-4 border-b border-border">
                <div className="relative">
                  <div className="size-20 rounded-full bg-primary/10 text-primary grid place-items-center overflow-hidden text-xl font-semibold">
                    {profile.avatarDataUrl
                      ? <img src={profile.avatarDataUrl} alt="" className="size-full object-cover" />
                      : initials || "··"}
                  </div>
                  <button onClick={() => fileRef.current?.click()}
                    className="absolute -bottom-1 -right-1 size-7 rounded-full bg-primary text-primary-foreground grid place-items-center border-2 border-background">
                    <Camera className="size-3.5" />
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => onAvatar(e.target.files?.[0])} />
                </div>
                <div className="text-sm">
                  <div className="font-medium">{profile.name || "Unnamed"}</div>
                  <div className="text-muted-foreground text-xs">{profile.email}</div>
                  {profile.avatarDataUrl && (
                    <button
                      onClick={async () => {
                        const next = { ...profile, avatarDataUrl: undefined };
                        setProfile(next);
                        await saveProfile(next).catch(() => {});
                        window.dispatchEvent(new Event("user-profile-updated"));
                      }}
                      className="text-xs text-destructive inline-flex items-center gap-1 mt-1">
                      <Trash2 className="size-3" />Remove photo
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-4">
                <Fld label="Full name"><Text value={profile.name} onChange={v => setProfile({ ...profile, name: v })} /></Fld>
                <Fld label="Email"><Text type="email" value={profile.email} onChange={v => setProfile({ ...profile, email: v })} /></Fld>
                <Fld label="Phone"><Text value={profile.phone ?? ""} onChange={v => setProfile({ ...profile, phone: v })} /></Fld>
                <Fld label="Timezone"><Text value={profile.timezone} onChange={v => setProfile({ ...profile, timezone: v })} /></Fld>
                <Fld label="Bio" full>
                  <textarea rows={3} value={profile.bio ?? ""} onChange={e => setProfile({ ...profile, bio: e.target.value })}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm" />
                </Fld>
              </div>
              <SaveBar onSave={save} />
            </Card>
          )}

          {section === "security" && (
            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Security</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Change your password</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Fld label="Current password"><Text type="password" value={pw.curr} onChange={v => setPw({ ...pw, curr: v })} /></Fld>
                <div />
                <Fld label="New password"><Text type="password" value={pw.next} onChange={v => setPw({ ...pw, next: v })} /></Fld>
                <Fld label="Confirm password"><Text type="password" value={pw.conf} onChange={v => setPw({ ...pw, conf: v })} /></Fld>
              </div>
              <div className="mt-3">
                <button onClick={updatePw} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 inline-flex items-center gap-1.5">
                  <Save className="size-3.5" />Update password
                </button>
              </div>
            </Card>
          )}

          {section === "preferences" && (
            <Card className="p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Preferences</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Language and timezone</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Fld label="Language">
                  <select value={profile.language}
                    onChange={e => setProfile({ ...profile, language: e.target.value as any })}
                    className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm">
                    <option value="en">English</option>
                    <option value="bn">বাংলা (Bangla)</option>
                  </select>
                </Fld>
                <Fld label="Timezone"><Text value={profile.timezone} onChange={v => setProfile({ ...profile, timezone: v })} /></Fld>
              </div>
              <SaveBar onSave={save} />
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Fld({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
function Text({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)}
    className="w-full px-3 py-1.5 rounded-md border border-border bg-background text-sm" />;
}
function SaveBar({ onSave }: { onSave: () => void }) {
  return (
    <div className="mt-5 pt-4 border-t border-border flex justify-end">
      <button onClick={onSave} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90">
        <Save className="size-3.5" />Save changes
      </button>
    </div>
  );
}