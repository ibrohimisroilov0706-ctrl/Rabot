# QIROLLIKLAR — 3D ishlab chiqish rejasi (TODO)

Bu yerda nima tayyor va nima hali qilinmagani yoziladi. Menyudagi tayyor bo'lmagan tugmalar bosilmaydi va qaysi bosqichda chiqishi yozib qo'yilgan.

## Arxitektura qarori

- **3D dvigatel:** kutubxonasiz o'z WebGL1 renderer (`apps/client/src/g3d/engine`).
  - Unity WebGL Telegram'dagi telefon brauzerlari uchun juda og'ir (yuklanishi 20+ MB, xotira ko'p).
  - Three.js'ni ushbu ish muhitida o'rnatib bo'lmadi (paket yuklash yopiq).
  - O'z renderer'imiz kichik (bir necha KB), har qanday telefonda ishlaydi.
  - Keyinchalik Three.js'ga o'tish oson: geometriya va o'yin mantig'i alohida modullarda.
- **2D global xarita (lord rejimi)** "Dunyo xaritasi" sifatida saqlanadi. Bu ikkinchi dvigatel emas, oddiy Canvas UI.
- **O'yin mantiqi DOM'siz** (`combat.ts`, `ai.ts`, `lord/world.ts`, `lord/battle.ts`), shuning uchun node testlarida tekshiriladi. 5-bosqichda serverda ham ishlatiladi (server-authoritative).

## 1-bosqich — TAYYOR

- [x] Loyiha tuzilmasi (`g3d/engine`, `g3d/*.ts`)
- [x] Bosh menyu: O'YNASH, DUNYO XARITASI, IMPERIYA, SHAHAR, ARMIYA, MULTIPLEYER, INVENTAR, SOZLAMALAR
- [x] Sivilizatsiya tanlash ekrani: 6 ta davlat, bayroq, tavsif, 3D aylanuvchi askar, ustunliklar
- [x] O'ynaladigan 3D qahramon: protsedural model va animatsiyalar (yurish, yugurish, 3 xil zarba, to'sish, chayqalish, yiqilish)
- [x] Uchinchi shaxs kamerasi:
  - telefonda: o'ng tomonda surish;
  - kompyuterda: sichqoncha (pointer lock), g'ildirak bilan masofa.
- [x] Harakat:
  - telefonda: chap tomonda dinamik joystick;
  - kompyuterda: WASD, Shift — yugurish.
- [x] Sinov maydoni: tepaliklar, yo'l, o'rmon, qoyalar, ikki lager, yog'och qo'rg'on, kun-tun almashinuvi
- [x] Qilich jangi:
  - zarba: tayyorlanish → urish → qaytish;
  - qalqon faqat old tomondan himoya qiladi;
  - chidamlilik, himoyaning sinishi, orqadan zarba +35%;
  - tayyorlanish paytida urilgan jangchi chayqaladi.
- [x] NPC askarlar:
  - dushman topadi, o'yinchiga ergashadi, hujum qiladi;
  - qalqon bilan himoyalanadi, yaradorlikda chekinadi;
  - bir nishonga ko'pi bilan 3 kishi uriladi, qolganlari aylanib kutadi.
- [x] Buyruqlar: Ergashing, Hujum, Turing, Orqaga (tugmalar yoki 1-4 tugmalari)
- [x] HUD: sog'liq, chidamlilik, qurol, ot holati, minikarta, to'lqin, o'ldirilganlar
- [x] 3 to'lqinli jang, g'alaba yoki mag'lubiyat oynasi, statistika saqlanadi
- [x] Sozlamalar: grafika sifati, kamera sezgirligi, kameraning teskari vertikali, kun-tun, maslahatlar

## 2-bosqich — keyingi

- [ ] Otga minish/tushish, otliq jang, otliq hujumi (charge), otdan kamon otish
- [ ] Kamon, nayza, arbalet (o'q fizikasi), qurol almashtirish va inventar
- [ ] Saflar (qator, ponasimon, aylana) va guruhlarga alohida buyruq
- [ ] Birinchi qal'a va shahar 3D'da: devor, darvoza, narvon, katapulta
- [ ] Shaharni bosib olish (3D qamal)
- [ ] 2D dunyo xaritasidagi janglarni 3D jangga ulash

## 3-bosqich

- [ ] Shahar qurish:
  - binolar: uy, bozor, kazarma, otxona, temirchilik, ferma, ombor, devor, minora, qal'a, saroy;
  - binolarning darajalari.
- [ ] Resurslar: oltin, oziq, yog'och, temir, aholi; ishlab chiqarish va iste'mol
- [ ] Imperiya boshqaruvi:
  - shahar ko'rsatkichlari: soliq, baxtiyorlik, mudofaa darajasi;
  - harakatlar: hokim tayinlash, yangi qishloq qurish.
- [ ] Saqlash: Telegram hisobi bo'yicha serverda (hozir telefonda va Telegram bulutida saqlanadi)

## 4-bosqich

- [ ] Har sivilizatsiya uchun 6–8 xil askar va o'ziga xos binolar 3D'da
- [ ] Yevrosiyo xaritasi:
  - Markaziy Osiyo, Hindiston, Xitoy, Anado'li, Britaniya, Sharqiy Yevropa;
  - hozirgi 2D xaritada 5 ta davlat bor (Mo'g'ullar o'rniga Boburiylar va Xitoy qo'shiladi).

## 5-bosqich

- [ ] Telegram orqali kirish va profil (onlayn server rejimida bor, 3D'ga ulanadi)
- [ ] Do'stlar ro'yxati, taklif havolalari (`startapp` parametri)
- [ ] Xususiy xonalar (5 o'yinchigacha):
  - xona ID, jamoa va sivilizatsiya tanlash, "Tayyor" tugmasi;
  - real vaqtli sinxronizatsiya: WebSocket, server-authoritative `combat.ts`.
- Hozircha bor: 2D xaritada "Do'st bilan jang" (kod almashish orqali, real vaqtli emas).

## 6-bosqich

- [ ] Telefonlarda unumdorlik:
  - LOD, instancing, uzoqdagi askarlarni soddalashtirish;
  - past darajali telefonlarda sinov.
- [ ] Ovoz va musiqa
