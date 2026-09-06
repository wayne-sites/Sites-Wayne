-- Mantém usernames automáticos únicos usando todos os 128 bits do UUID.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=''
as $$
begin
  insert into public.profiles(id,username,display_name)
  values(
    new.id,
    'user_' || rtrim(translate(encode(uuid_send(new.id),'base64'), '+/', '-_'), '='),
    coalesce(new.raw_user_meta_data->>'display_name','Novo membro')
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
