"use client";

import * as React from "react";
import { LogOut, User as UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { USER_ROLE_LABELS, type Profile } from "@/lib/types";

function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  return source
    .split(/[ @._-]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
}

export function UserMenu({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-9 gap-2 px-2">
          <Avatar className="h-7 w-7">
            {profile.avatar_url ? (
              <AvatarImage src={profile.avatar_url} alt={profile.email} />
            ) : null}
            <AvatarFallback>
              {initials(profile.full_name, profile.email)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-left text-xs sm:block">
            <div className="font-medium leading-none">
              {profile.full_name || profile.email}
            </div>
            <div className="text-muted-foreground">
              {USER_ROLE_LABELS[profile.role]}
            </div>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span>{profile.full_name || profile.email}</span>
            <span className="text-xs text-muted-foreground">
              {profile.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/dashboard/settings">
            <UserIcon className="mr-2 h-4 w-4" />
            Profile
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
