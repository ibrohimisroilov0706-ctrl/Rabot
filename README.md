unzip qirolliklar.zip && cd qirolliklar
cp .env.example .env   # parol, JWT_SECRET, bot tokenini yozing
docker compose up -d --build
