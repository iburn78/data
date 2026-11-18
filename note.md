## Cloudflared  
- cloudflared tunnel --url http://localhost:3000
- run node locally

## Google Cloud
- issuetracker id logged in (gcloud init)
- project: qp-node-server
- gcloud run deploy qp-node-server \
  --source . \
  --region asia-northeast3 \
  --allow-unauthenticated
- needs adjustments like to be able to access config files in \config\...
- when updated, need to rebuild