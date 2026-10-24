import { router } from "expo-router";
import type { Meta } from "../../../app/src/lib/addons";

export const openTitle = (m: Pick<Meta, "type" | "id">) => router.push({ pathname: "/title/[type]/[id]", params: { type: m.type, id: m.id } });
