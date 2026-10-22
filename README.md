# Akarás Gambling – Renderre telepíthető változat

Teljes forráskód, lila arculattal, mind a 16 csapatlogóval, a „0-0” kör nyolc párosításával, fogadószelvénnyel és adminfelülettel.

**Ez önálló telepítés.** A jelenlegi ChatGPT Sites oldal működését nem módosítja. A régi oldal fiókjai, egyenlegei és fogadásai nincsenek a csomagban, és nem másolódnak át automatikusan. Az új telepítésen új fiókok indulnak 5000 kredittel. A logók és a meccsek benne vannak.

## Fontos a hosting előtt

- Egyetlen Node.js Web Service szolgálja ki a felületet és az API-t. Nem Static Site.
- Node.js 24 szükséges; a projekt beállítja a főverziót.
- Saját e-mail/jelszó regisztráció és belépés van. A ChatGPT Sites bejelentkezése Renderen nem használható.
- SQLite adatbázis, tartós Render-lemezen. A `render.yaml` **fizetős** szolgáltatást és 1 GB lemezt kér. Ezt csak a Render felületén történő telepítésed hozza létre; a ZIP letöltése semmit nem rendel meg.
- A Render ingyenes Web Service lemeze nem tartós. Ezzel a csomaggal ne válassz Free csomagot a valódi játékosadatokhoz. Ingyenes alkalmazásszerverhez külön, külső tartós adatbázisra való átalakítás kellene.
- A virtuális kreditet nem lehet vásárolni, kivenni vagy pénzre váltani.

## 1. Feltöltés GitHubra

1. Csomagold ki a ZIP-et.
2. Hozz létre egy új GitHub-repositoryt, például `akaras-gambling` néven.
3. Az `akaras-gambling-render` mappa **tartalmát** töltsd fel a repository gyökerébe. A `package.json` és a `render.yaml` közvetlenül a gyökérben legyen.
4. Ne tölts fel `node_modules`, `data`, `backups` mappát, tényleges `.env` fájlt vagy adatbázisfájlt. A mellékelt `.gitignore` ezeket kizárja.
5. A `package-lock.json`, `migrations`, `server`, `lib`, `src` és `public/team-logos` kerüljön fel.

## 2. Ajánlott telepítés: Render Blueprint

1. Nyisd meg: https://dashboard.render.com/
2. **New → Blueprint**, majd csatlakoztasd a GitHub-repositoryt.
3. A Render beolvassa a `render.yaml` fájlt, ami létrehozza a Web Service-t és a tartós lemezt.
4. Két értéket neked kell megadnod a Render titkos környezeti változóiként:
   - `ADMIN_EMAIL`: a saját admin e-mail-címed.
   - `ADMIN_PASSWORD`: egy egyedi, legalább 12, legfeljebb 128 karakteres jelszó.
5. Ellenőrizd a Render által jelzett költséget és szolgáltatást, majd indítsd a telepítést.
6. A sikeres deploy után nyisd meg a Render által adott `https://...onrender.com` címet.
7. **Bejelentkezés**: az előbb megadott admin e-mail és jelszó. Az adminfiók automatikusan létrejön az első indításkor; nem kell külön regisztrálnod.
8. A barátaid a **Regisztráció** fülön saját fiókot hozhatnak létre.

A Render automatikusan megadja a `RENDER_EXTERNAL_URL` változót; a szerver ezt használja az onrender.com domainhez. Saját domainnél állítsd be külön az `APP_URL` értéket, például `https://jatek.sajatdomain.hu` (útvonal nélkül). Ekkor a játékot azon a címen használd, mert a módosító kérések eredetét a szerver ellenőrzi.

## 3. Kézi Render-beállítás, ha nem Blueprintet használsz

| Mező | Érték |
|---|---|
| Service type | Web Service |
| Runtime | Node |
| Root Directory | üres, ha a fájlok a repository gyökerében vannak |
| Build Command | `npm ci --include=dev && npm run build` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance | fizetős, tartós lemezt támogató csomag |
| Disk mount path | `/var/data` |
| Disk size | 1 GB |

Környezeti változók:

| Név | Érték |
|---|---|
| `NODE_VERSION` | `24` |
| `NODE_ENV` | `production` |
| `DATABASE_PATH` | `/var/data/akaras.sqlite` |
| `ADMIN_EMAIL` | a saját admin e-mail-címed |
| `ADMIN_PASSWORD` | saját, egyedi 12–128 karakteres jelszó |
| `APP_URL` | opcionális, saját domain esetén a pontos HTTPS eredet |

A `PORT` értékét a Render adja, nem kell kézzel beállítanod. A szerver `0.0.0.0` címen figyel. Az adatbázis az induláskor jön létre, nem a build során.

## 4. Használat

- Kezdő kredit: **5000**.
- Első kör: **0-0**, külön második kezdő bónusz nélkül.
- Minden később elindított körért a már létező játékosfiókok **egyszer +5000 kreditet** kapnak. A maradék továbbvihető. Az offline játékosok a következő belépéskor kapják meg az addigi új körök jutalmait.
- Az új játékos a belépésekor 5000 kredittel kezd; korábbi körökre nincs visszamenőleges jutalom.
- Egy szelvényen több meccs is lehet, de mindegyik tippnek nyernie kell.
- Admin: **Admin → Fogadások zárolása → győztesek és opcionális pontszámok mentése → Kör lezárása és elszámolása**.
- A kör végleges lezárása után az eredmények nem módosíthatók a felületen.
- **Admin → Új kör létrehozása**: tetszőleges, 1–60 karakteres név, például `1-0`, `0-2`, `Semifinal`, `Final` vagy `Döntő`. A név nem befolyásolja a sorrendet.
- A létrehozott kör automatikusan kijelölődik. A **Meccs hozzáadása** űrlapon add meg a két csapatot és az oddsokat (1,01–1000, legfeljebb két tizedesjegy). A csapatlistából választhatsz, vagy beírhatsz új nevet. Ismert csapatnál automatikusan megjelenik a logó.
- Tervezett meccset törölhetsz és javítva újra felvehetsz. Indítás után a párosítások és oddsok nem módosíthatók.
- **Kör indítása**: legalább egy meccs szükséges, és az összes korábbi körnek lezártnak kell lennie. A körök létrehozási sorrendben indulnak. A létrehozás önmagában nem ad jutalmat; az indítás ad egyszer +5000 kreditet.
- A körök és meccsek az adatbázisba kerülnek; új fordulóhoz nem kell új kódot feltölteni.
- Az oddsok játékhoz megadott szorzók, nem élő bukmékeradatok.

## Frissítés a korábbi Render-verzióról (v2)

1. Készíts adatbázismentést a lent leírt `npm run backup` paranccsal.
2. A meglévő GitHub-repositoryban cseréld le a forrásfájlokat erre a csomagra, majd indíts új deployt **ugyanazon a Render Web Service-en**.
3. Tartsd meg a csatolt tartós lemezt és a `DATABASE_PATH` értékét. Ne töröld vagy hozd létre újra a szolgáltatást, és ne tölts fel üres adatbázist.
4. Az adminfiók, jelszavak, játékosok, egyenlegek, fogadások és eredmények ugyanabból az adatbázisból töltődnek. A frissítés nem nullázza őket, és nem ad külön jutalmat.
5. Az Admin fülön megjelenik az új kör- és meccslétrehozó felület. Nincs új környezeti változó vagy kézi adatbázismódosítás.

Ez a megőrzés a korábbi **Render-csomag** azonos adatbázisán működik; a külön ChatGPT Sites oldalról nem importál automatikusan adatokat.

## 5. Helyi kipróbálás Windows alatt

Telepíts Node.js 24-et. Terminálban lépj a kicsomagolt projekt mappájába:

```powershell
npm ci
Copy-Item .env.example .env
```

Nyisd meg a `.env` fájlt, és add meg az `ADMIN_EMAIL` és `ADMIN_PASSWORD` értékét. Hagyd a helyi `APP_URL=http://localhost:3000` beállítást.

```powershell
npm run build
npm start
```

Nyisd meg: http://localhost:3000

Ha a PowerShell tiltja az npm.ps1 futtatását, használd az `npm.cmd` parancsot `npm` helyett, vagy a Windows parancssort.

Mac/Linux alatt a másolás: `cp .env.example .env`.

## 6. Jelszavak és adminfiók

Az adminjogot nem a regisztrációkor megadott név vagy egy böngészős kapcsoló adja. Az első indítás a titkos környezeti változókból külön adminfiókot készít, a játékosok regisztrációja mindig játékosjogot ad.

Az `ADMIN_PASSWORD` az első létrehozásra szolgál. Későbbi módosítása a Render változói között **nem írja át** egy meglévő admin jelszavát. Az admin kezdeti létrehozása után ezt a változót eltávolíthatod; a meglévő admin adatbázisból betölthető. Az `ADMIN_EMAIL` maradjon az eredeti admin címe.

Jelszó-visszaállítás az üzemeltetői Render Shellben:

```sh
npm run reset-password -- sajat@email.hu
```

A parancs rejtett bevitellel kéri az új jelszót, és kijelentkezteti az adott fiók minden meglévő munkamenetét. Ne írd a jelszót a parancs argumentumába és ne commitold fájlba. Az admin más játékos jelszavát is így állíthatja vissza, miután ellenőrizte a kérés jogosultságát.

Ez a változat nem küld e-mail-megerősítést vagy automatikus jelszó-visszaállító levelet. Az e-mail-cím belépési azonosító, nem ellenőrzött kapcsolattartási cím. A munkamenetek 7 nap után lejárnak. Sikertelen belépések és regisztrációk száma korlátozott; a korlátozás szerver-újraindításkor újraindul.

## 7. Adatmegőrzés és mentés

Az összes fiók, jelszó hash, szelvény és egyenleg a `DATABASE_PATH` fájlban van. A tartós lemeznek a futó szolgáltatáshoz kell tartoznia. Egyetlen szerverpéldányt használj ezzel az SQLite-változattal.

Biztonságos SQLite-mentés Render Shellből:

```sh
npm run backup -- /var/data/backups/akaras-backup-2026-10-22.sqlite
```

Minden mentéshez új fájlnevet válassz. A parancs következetes SQLite-pillanatképet készít. Töltsd le és őrizd meg külön is a mentést; az ugyanazon lemezen tartott másolat nem véd a teljes lemez elvesztésétől. A mentés személyes adatokat és jelszóhasheket tartalmaz, ne tedd nyilvános repositoryba.

Visszaállítás előtt állítsd le a szolgáltatást; csak ezután cseréld le az adatbázist a mentésre, és kezeld a hozzá tartozó WAL/SHM fájlokat. Ha nem vagy biztos a lépésekben, kérj külön segítséget az adatvesztés elkerüléséhez.

## 8. Ellenőrzések és korlátok

```sh
npm test
npm run build
```

Tesztelve: első egyenleg, egyéni előzmények, regisztráció/bejelentkezés/kilépés, jogosulatlan adminműveletek elutasítása, hamis auth fejlécek figyelmen kívül hagyása, Origin ellenőrzés, dupla küldés, fedezetellenőrzés, körzárolás, elszámolás, jutalom és újraindítás utáni adatmegőrzés.

A csomag buildjét és a szervert helyben ellenőriztük. A te Render-fiókodban még nincs telepítve. A jelenlegi oldal adatbázis-exportját és importját ez a csomag nem tartalmazza. Az alkalmazás önálló, Cloudflare- vagy ChatGPT Sites-függőség nélkül indul.

## Források a Render-beállításokhoz

Ellenőrizve: 2026. október 22.

- https://render.com/docs/disks
- https://render.com/docs/blueprint-spec
- https://render.com/docs/node-version

## Projektfelépítés

- `src/`: React felület, lila stílusok, logótérkép
- `public/team-logos/`: a megadott 16 csapatlogó
- `server/`: Node HTTP API, jelszavak, munkamenetek, SQLite adapter, mentés és jelszócsere
- `lib/game.ts`: fogadási és admin üzleti logika
- `lib/fixtures.ts`: körök, meccsek és oddsok
- `migrations/`: verziózott adatbázisséma
- `tests/`: automatizált ellenőrzések
- `render.yaml`: Render telepítési beállítások

A csapatlogók a felhasználó által megadott LoL Esports képek; a hozzájuk tartozó védjegyek a jogosultaké.
