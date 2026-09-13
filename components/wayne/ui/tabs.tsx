"use client";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
export const Tabs = TabsPrimitive.Root;
export function TabsList(p: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List {...p} className={"tabs " + (p.className || "")} />
  );
}
export function TabsTrigger(p: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger {...p} className={"tab " + (p.className || "")} />
  );
}
export function TabsContent(p: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      {...p}
      className={"tab-content " + (p.className || "")}
    />
  );
}
