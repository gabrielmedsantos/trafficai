"use client";
import { useParams } from "next/navigation";
import FlowEditor from "@/components/automations/FlowEditor";
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <FlowEditor id={id} />;
}
