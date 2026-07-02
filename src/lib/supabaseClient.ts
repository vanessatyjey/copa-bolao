import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente usado no navegador. Só enxerga o que as políticas de RLS
// (ver supabase/schema.sql) deixam: ler tudo, criar jogador e criar palpite.
export const supabase = createClient(url, anonKey);
