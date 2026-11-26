-- db/migrations/001_init.sql
-- QIROLLIKLAR: asosiy schema. PostgreSQL 14+ (gen_random_uuid ichki funksiya).
-- Qoida: barcha resurs va son ustunlarida CHECK (>= 0); egalik maydonlari alohida (owner/serving).

CREATE TYPE culture AS ENUM ('rus', 'ingliz', 'usmonli', 'temuriy', 'mogul');
CREATE TYPE army_kind AS ENUM ('garrison', 'field');
CREATE TYPE army_status AS ENUM ('home', 'marching', 'returning', 'stationed');
CREATE TYPE service_status AS ENUM ('ittifoqchi', 'vassal', 'yollanma');
CREATE TYPE contract_state AS ENUM ('taklif', 'faol', 'yopildi', 'rad_etildi');
CREATE TYPE treaty_type AS ENUM ('ittifoq', 'savdo', 'tinchlik', 'urush', 'nikoh');
CREATE TYPE treaty_state AS ENUM ('taklif', 'faol', 'tugadi', 'buzildi', 'rad_etildi');
CREATE TYPE event_state AS ENUM ('pending', 'processing', 'done', 'failed');

-- ---------------------------------------------------------------- users
CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id    bigint NOT NULL UNIQUE,
  username       text,
  first_name     text NOT NULL DEFAULT '',
  language_code  text NOT NULL DEFAULT 'uz',
  is_banned      boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- kingdoms
CREATE TABLE kingdoms (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name               text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 3 AND 32),
  culture            culture NOT NULL,
  ruler_name         text NOT NULL,
  ruler_generation   integer NOT NULL DEFAULT 1 CHECK (ruler_generation >= 1),
  capital_city_id    uuid,
  king_city_id       uuid,             -- qirol hozir qaysi saroyda (mehmonlik uchun)
  reputation         integer NOT NULL DEFAULT 0 CHECK (reputation BETWEEN -100 AND 100),
  noble_loyalty      integer NOT NULL DEFAULT 60 CHECK (noble_loyalty BETWEEN 0 AND 100),
  regent_until       timestamptz,
  shield_until       timestamptz,      -- yangi o'yinchi himoyasi (D-13)
  traitor_until      timestamptz,
  guest_killer_until timestamptz,      -- D-11
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- cities
CREATE TABLE cities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id          uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  name                text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 40),
  x                   integer NOT NULL CHECK (x >= 0),
  y                   integer NOT NULL CHECK (y >= 0),
  population          double precision NOT NULL DEFAULT 300 CHECK (population >= 0),
  tax_pct             integer NOT NULL DEFAULT 10 CHECK (tax_pct BETWEEN 0 AND 40),
  happiness           integer NOT NULL DEFAULT 70 CHECK (happiness BETWEEN 0 AND 100),
  low_happiness_since timestamptz,
  war_weariness       integer NOT NULL DEFAULT 0 CHECK (war_weariness BETWEEN 0 AND 30),
  wall_hp             integer NOT NULL DEFAULT 0 CHECK (wall_hp >= 0),
  last_simulated_at   timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (x, y)
);
CREATE INDEX cities_kingdom_idx ON cities (kingdom_id);
CREATE INDEX cities_xy_idx ON cities (x, y);

ALTER TABLE kingdoms ADD CONSTRAINT kingdoms_capital_fk FOREIGN KEY (capital_city_id) REFERENCES cities(id) ON DELETE SET NULL;
ALTER TABLE kingdoms ADD CONSTRAINT kingdoms_king_city_fk FOREIGN KEY (king_city_id) REFERENCES cities(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------- resources
CREATE TABLE resources (
  city_id  uuid PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
  gold     double precision NOT NULL DEFAULT 0 CHECK (gold >= 0),
  food     double precision NOT NULL DEFAULT 0 CHECK (food >= 0),
  wood     double precision NOT NULL DEFAULT 0 CHECK (wood >= 0),
  stone    double precision NOT NULL DEFAULT 0 CHECK (stone >= 0),
  iron     double precision NOT NULL DEFAULT 0 CHECK (iron >= 0),
  horses   double precision NOT NULL DEFAULT 0 CHECK (horses >= 0)
);

-- ---------------------------------------------------------------- buildings
CREATE TABLE buildings (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id  uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  key      text NOT NULL CHECK (key IN ('saroy','ferma','yogoch','tosh_kon','temir_kon','otxona','ombor','mahalla',
                                        'kazarma','temirchilik','ustaxona','devor','minora','bozor','karvonsaroy',
                                        'ibodatxona','akademiya','elchixona','qamoqxona')),
  level    integer NOT NULL CHECK (level BETWEEN 0 AND 10), -- 0 = qurilmoqda (birinchi daraja)
  slot     integer NOT NULL CHECK (slot BETWEEN 0 AND 29),
  UNIQUE (city_id, slot)
);
CREATE UNIQUE INDEX buildings_unique_kind ON buildings (city_id, key)
  WHERE key NOT IN ('ferma','yogoch','tosh_kon','temir_kon','mahalla');

-- ---------------------------------------------------------------- construction_queue
CREATE TABLE construction_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id       uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  building_id   uuid NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  target_level  integer NOT NULL CHECK (target_level BETWEEN 1 AND 10),
  cost          jsonb NOT NULL,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finishes_at   timestamptz NOT NULL,
  state         text NOT NULL DEFAULT 'active' CHECK (state IN ('active','done','cancelled')),
  CHECK (finishes_at > started_at)
);
CREATE INDEX construction_active_idx ON construction_queue (city_id) WHERE state = 'active';

-- ---------------------------------------------------------------- commanders
CREATE TABLE commanders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  skill       integer NOT NULL DEFAULT 5 CHECK (skill BETWEEN 0 AND 30),
  prestige    integer NOT NULL DEFAULT 50 CHECK (prestige BETWEEN 0 AND 100),
  wins        integer NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses      integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  alive       boolean NOT NULL DEFAULT true,
  captured_by uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commanders_kingdom_idx ON commanders (kingdom_id);

-- ---------------------------------------------------------------- armies
CREATE TABLE armies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kingdom_id   uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,  -- asl egasi, o'zgarmaydi
  serving_kingdom_id uuid REFERENCES kingdoms(id) ON DELETE SET NULL,          -- xizmat shartnomasi bo'yicha
  home_city_id       uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  culture            culture NOT NULL,
  kind               army_kind NOT NULL,
  status             army_status NOT NULL DEFAULT 'home',
  commander_id       uuid REFERENCES commanders(id) ON DELETE SET NULL,
  x                  double precision NOT NULL,
  y                  double precision NOT NULL,
  from_x             double precision,
  from_y             double precision,
  to_x               double precision,
  to_y               double precision,
  target_city_id     uuid REFERENCES cities(id) ON DELETE SET NULL,
  station_city_id    uuid REFERENCES cities(id) ON DELETE SET NULL,
  mission            text NOT NULL DEFAULT 'none' CHECK (mission IN ('none','attack','return','station')),
  depart_at          timestamptz,
  arrive_at          timestamptz,
  xp                 integer NOT NULL DEFAULT 0 CHECK (xp >= 0),
  loot               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (serving_kingdom_id IS NULL OR serving_kingdom_id <> owner_kingdom_id)
);
CREATE UNIQUE INDEX armies_one_garrison ON armies (home_city_id) WHERE kind = 'garrison';
CREATE INDEX armies_owner_idx ON armies (owner_kingdom_id);
CREATE INDEX armies_serving_idx ON armies (serving_kingdom_id) WHERE serving_kingdom_id IS NOT NULL;
CREATE INDEX armies_moving_idx ON armies (status) WHERE status IN ('marching','returning');
CREATE INDEX armies_station_idx ON armies (station_city_id) WHERE station_city_id IS NOT NULL;

CREATE TABLE army_units (
  army_id   uuid NOT NULL REFERENCES armies(id) ON DELETE CASCADE,
  unit_key  text NOT NULL,
  count     integer NOT NULL CHECK (count >= 0),
  PRIMARY KEY (army_id, unit_key)
);

-- ---------------------------------------------------------------- army_service (xizmat shartnomasi)
CREATE TABLE army_service (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  army_id           uuid REFERENCES armies(id) ON DELETE SET NULL,   -- qo'shin yo'q bo'lsa ham shartnoma tarixi qoladi
  owner_kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  host_kingdom_id   uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  status            service_status NOT NULL,
  state             contract_state NOT NULL DEFAULT 'taklif',
  pay_per_hour      integer NOT NULL DEFAULT 0 CHECK (pay_per_hour >= 0),
  command_level     integer NOT NULL DEFAULT 1 CHECK (command_level BETWEEN 0 AND 2),
  tribute_pct       integer NOT NULL DEFAULT 0 CHECK (tribute_pct BETWEEN 0 AND 30),
  duration_hours    integer NOT NULL CHECK (duration_hours BETWEEN 1 AND 720),
  starts_at         timestamptz,
  ends_at           timestamptz,
  wins              integer NOT NULL DEFAULT 0 CHECK (wins >= 0),   -- R6 bilan nolga tushadi
  losses            integer NOT NULL DEFAULT 0 CHECK (losses >= 0),
  total_wins        integer NOT NULL DEFAULT 0 CHECK (total_wins >= 0),
  total_losses      integer NOT NULL DEFAULT 0 CHECK (total_losses >= 0),
  paid_total        double precision NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  owed_total        double precision NOT NULL DEFAULT 0 CHECK (owed_total >= 0),
  unpaid_since      timestamptz,
  last_settled_at   timestamptz,
  generosity_until  timestamptz,
  closed_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_kingdom_id <> host_kingdom_id)
);
CREATE UNIQUE INDEX army_service_one_open ON army_service (army_id) WHERE state IN ('taklif','faol');
CREATE INDEX army_service_host_idx ON army_service (host_kingdom_id, state);
CREATE INDEX army_service_owner_idx ON army_service (owner_kingdom_id, state);

-- ---------------------------------------------------------------- battles
CREATE TABLE battles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at          timestamptz NOT NULL DEFAULT now(),
  x                    integer NOT NULL,
  y                    integer NOT NULL,
  terrain              text NOT NULL,
  weather              text NOT NULL,
  attacker_kingdom_id  uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  defender_kingdom_id  uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  target_city_id       uuid REFERENCES cities(id) ON DELETE SET NULL,
  winner               text NOT NULL CHECK (winner IN ('attacker','defender')),
  ratio                double precision NOT NULL,
  luck                 double precision NOT NULL,
  attack_power         double precision NOT NULL,
  defense_power        double precision NOT NULL,
  wall_hp_before       integer NOT NULL DEFAULT 0,
  wall_hp_after        integer NOT NULL DEFAULT 0,
  loot                 jsonb NOT NULL DEFAULT '{}'::jsonb,
  input                jsonb NOT NULL  -- to'liq BattleInput: qayta hisoblab tekshirish uchun
);
CREATE INDEX battles_attacker_idx ON battles (attacker_kingdom_id, occurred_at DESC);
CREATE INDEX battles_defender_idx ON battles (defender_kingdom_id, occurred_at DESC);

CREATE TABLE battle_records (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id   uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  army_id     uuid REFERENCES armies(id) ON DELETE SET NULL,
  kingdom_id  uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  side        text NOT NULL CHECK (side IN ('attacker','defender')),
  unit_key    text NOT NULL,
  before      integer NOT NULL CHECK (before >= 0),
  lost        integer NOT NULL CHECK (lost >= 0 AND lost <= before)
);
CREATE INDEX battle_records_battle_idx ON battle_records (battle_id);

-- ---------------------------------------------------------------- diplomacy
CREATE TABLE diplomacy (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type             treaty_type NOT NULL,
  from_kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  to_kingdom_id    uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  state            treaty_state NOT NULL DEFAULT 'taklif',
  duration_hours   integer NOT NULL CHECK (duration_hours BETWEEN 1 AND 2160),
  starts_at        timestamptz,
  ends_at          timestamptz,
  terms            jsonb NOT NULL DEFAULT '{}'::jsonb,
  broken_by        uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (from_kingdom_id <> to_kingdom_id)
);
CREATE INDEX diplomacy_pair_idx ON diplomacy (from_kingdom_id, to_kingdom_id, state);
CREATE INDEX diplomacy_to_idx ON diplomacy (to_kingdom_id, state);

CREATE TABLE diplomatic_trust (
  kingdom_a  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  kingdom_b  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  value      integer NOT NULL DEFAULT 0 CHECK (value BETWEEN -100 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kingdom_a, kingdom_b),
  CHECK (kingdom_a < kingdom_b)
);

-- ---------------------------------------------------------------- heirs
CREATE TABLE heirs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  birth_at    timestamptz NOT NULL,
  order_rank  integer NOT NULL CHECK (order_rank >= 1),
  alive       boolean NOT NULL DEFAULT true,
  legitimacy  integer NOT NULL DEFAULT 50 CHECK (legitimacy BETWEEN 0 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX heirs_kingdom_idx ON heirs (kingdom_id, order_rank) WHERE alive;

-- ---------------------------------------------------------------- rebellions
CREATE TABLE rebellions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  city_id     uuid REFERENCES cities(id) ON DELETE SET NULL,
  army_id     uuid REFERENCES armies(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('fuqarolar','taxt_uchun','qoshin_tarqalish','qoshin_mustaqillik','qoshin_urush')),
  state       text NOT NULL DEFAULT 'yakunlandi' CHECK (state IN ('faol','bostirildi','yakunlandi')),
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX rebellions_kingdom_idx ON rebellions (kingdom_id, created_at DESC);

-- ---------------------------------------------------------------- agents & assassinations
CREATE TABLE agents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  name        text NOT NULL,
  skill       integer NOT NULL CHECK (skill BETWEEN 0 AND 100),
  state       text NOT NULL DEFAULT 'tayyor' CHECK (state IN ('tayyor','missiyada','asir','olgan')),
  captured_by uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agents_kingdom_idx ON agents (kingdom_id, state);

CREATE TABLE assassinations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  target_kingdom_id     uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  host_city_id          uuid REFERENCES cities(id) ON DELETE SET NULL,
  agent_id              uuid REFERENCES agents(id) ON DELETE SET NULL,
  prep_gold             integer NOT NULL CHECK (prep_gold >= 0),
  security              integer NOT NULL,
  p_success             double precision NOT NULL,
  success               boolean NOT NULL,
  exposed               boolean NOT NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assassinations_pair_idx ON assassinations (organizer_kingdom_id, target_kingdom_id, created_at DESC);

-- ---------------------------------------------------------------- territories (viloyatlar)
CREATE TABLE territories (
  id                integer PRIMARY KEY,
  rx                integer NOT NULL,
  ry                integer NOT NULL,
  owner_kingdom_id  uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  controlled_since  timestamptz,
  UNIQUE (rx, ry)
);
CREATE INDEX territories_owner_idx ON territories (owner_kingdom_id);

-- ---------------------------------------------------------------- game_events (World Engine navbati)
CREATE TABLE game_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type        text NOT NULL,
  due_at      timestamptz NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  state       event_state NOT NULL DEFAULT 'pending',
  attempts    integer NOT NULL DEFAULT 0,
  locked_at   timestamptz,
  last_error  text,
  dedupe_key  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_events_due_idx ON game_events (due_at) WHERE state = 'pending';
CREATE UNIQUE INDEX game_events_dedupe ON game_events (dedupe_key) WHERE dedupe_key IS NOT NULL AND state IN ('pending','processing');
CREATE INDEX game_events_city_idx ON game_events ((payload->>'cityId')) WHERE state = 'pending';

-- ---------------------------------------------------------------- trade
CREATE TABLE trade_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_id     uuid NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  resource    text NOT NULL CHECK (resource IN ('food','wood','stone','iron','horses')),
  side        text NOT NULL CHECK (side IN ('buy','sell')),
  amount      integer NOT NULL CHECK (amount > 0),
  unit_price  double precision NOT NULL CHECK (unit_price > 0),
  fee         double precision NOT NULL CHECK (fee >= 0),
  counterparty text NOT NULL DEFAULT 'npc',
  state       text NOT NULL DEFAULT 'bajarildi' CHECK (state IN ('ochiq','bajarildi','bekor')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trade_orders_kingdom_idx ON trade_orders (kingdom_id, created_at DESC);

CREATE TABLE market_state (
  zone        culture NOT NULL,
  resource    text NOT NULL,
  net_bought  double precision NOT NULL DEFAULT 0,  -- eksponensial so'nuvchi 24 soatlik sof talab
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (zone, resource)
);

-- ---------------------------------------------------------------- notifications & audit
CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kingdom_id  uuid NOT NULL REFERENCES kingdoms(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_kingdom_idx ON notifications (kingdom_id, created_at DESC);

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  kingdom_id  uuid REFERENCES kingdoms(id) ON DELETE SET NULL,
  action      text NOT NULL,
  ip          text,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_kingdom_idx ON audit_logs (kingdom_id, created_at DESC);
CREATE INDEX audit_logs_action_idx ON audit_logs (action, created_at DESC);
