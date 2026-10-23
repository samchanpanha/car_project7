How to Manage Your Containers
Action	Command
Start in background	
docker compose up -d
Stop all containers	
docker compose down
View live logs	
docker compose logs -f
View web app logs only	
docker compose logs -f web
View daemon logs only	
docker compose logs -f telegram-daemon
Rebuild after code edits	
docker compose build 
(or docker compose up -d --build)