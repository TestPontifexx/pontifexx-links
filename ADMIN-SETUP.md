# Pontifexx admin — veilige installatie

De beheerpagina staat in `/admin/`, maar werkt bewust **fail-closed** totdat de beveiligde diensten zijn geconfigureerd. De openbare frontend bevat alleen de Supabase project-URL en publishable/anon key; nooit een GitHub-token of Supabase service-role key.

## 1. Maak Supabase klaar
1. Maak een project aan via https://supabase.com/dashboard.
2. Ga naar **Authentication → Providers → Email** en schakel e-mail/wachtwoord in. Schakel e-mailbevestiging in.
3. Maak via **Authentication → Users** handmatig één gebruiker aan met jouw beheerders-e-mailadres en een sterk uniek wachtwoord. Gebruik geen openbare registratie voor dit paneel.
4. Stel onder Authentication → URL Configuration de site URL in op `https://testpontifexx.github.io` en voeg `https://testpontifexx.github.io/pontifexx-links/admin/` toe aan de redirect allow list.
5. Noteer de project URL en de publishable key (of legacy anon key). Deze twee zijn bedoeld voor browsergebruik; deel geen secret/service-role key.

## 2. Configureer de browser
Bewerk `admin/config.js`:
- `SUPABASE_URL`: de project URL.
- `SUPABASE_ANON_KEY`: de publishable/anon key.
- `PUBLISH_FUNCTION_URL`: `https://JOUW-PROJECT-REF.supabase.co/functions/v1/publish-site`.

Deze waarden zijn publieke clientconfiguratie. Plaats hier nooit geheime sleutels.

## 3. Deploy de beveiligde Edge Function
Installeer de Supabase CLI en voer vanuit de repository uit:
```sh
supabase login
supabase link --project-ref JOUW-PROJECT-REF
supabase functions deploy publish-site
supabase secrets set ADMIN_EMAIL="jouw-beheerdersmail@example.com" GITHUB_REPO="TestPontifexx/pontifexx-links" GITHUB_BRANCH="main" GITHUB_TOKEN="JOUW_GITHUB_TOKEN"
```
Gebruik voor `GITHUB_TOKEN` bij voorkeur een fine-grained GitHub token dat alleen toegang heeft tot deze repository en alleen **Contents: Read and write** heeft. Bewaar het uitsluitend als Supabase Edge Function secret. Verwijder of roteer het token direct als het ooit in clientcode, een commit of chat terechtkomt.
De functie valideert de Supabase-sessie aan de serverkant en vergelijkt het bevestigde e-mailadres met `ADMIN_EMAIL`. Alleen dat account mag publiceren. Laat JWT-verificatie voor de functie ingeschakeld.

## 4. Test vóór gebruik
1. Open `https://testpontifexx.github.io/pontifexx-links/admin/`. Totdat de waarden zijn ingevuld, toont de pagina de configuratiestatus en accepteert ze geen wachtwoord.
2. Log in met het vooraf aangemaakte, bevestigde beheerdersaccount.
3. Test eerst met een kleine wijziging. Controleer de commits in GitHub en de live pagina na de GitHub Pages build.
4. Zet bij voorkeur tweestapsverificatie aan voor je GitHub-account en Supabase-account. Gebruik een uniek wachtwoord en houd de GitHub-tokenrechten minimaal.

## Beperkingen
- GitHub Contents API maakt per bestand een afzonderlijke commit; een publicatie kan daardoor uit meerdere commits bestaan.
- Deze setup beheert links, de vijf inhoudsvelden en de drie bestaande CSS-kleuren. Het bestaande ontwerp en de rest van de website blijven intact.
- De adminpagina zelf is publiek bereikbaar, maar de gegevens en publicatiefunctie zijn niet toegankelijk zonder een geldig bevestigd beheerdersaccount. De browserkey is geen geheim; de GitHub-token is dat wel.
