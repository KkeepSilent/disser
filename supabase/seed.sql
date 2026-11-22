-- Demo admin account. The database stores only a pgcrypto bcrypt hash.
-- Run with psql; it prompts for the password so the credential is not kept in git.
\prompt 'Password for demo user edu: ' edu_password
select public.set_app_user_password('edu', :'edu_password', 25000, 'admin');
\unset edu_password
