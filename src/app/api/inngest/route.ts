import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

// The Inngest dev server discovers and invokes functions through this endpoint.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
