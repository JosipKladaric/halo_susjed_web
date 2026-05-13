export const supabaseUrl = 'https://edzldzjwogwzmekqvape.supabase.co';
export const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkemxkemp3b2d3em1la3F2YXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyNDk5NTUsImV4cCI6MjA5MzgyNTk1NX0.k11qcVKTar0rlYtP15whBwaF2USg6gJ63hRa-2VGs7g';

export const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true
    }
});
