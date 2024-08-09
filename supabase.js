import { createClient } from '@supabase/supabase-js'
import env from "dotenv"

env.config()

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

export default supabase