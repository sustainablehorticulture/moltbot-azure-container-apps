# Trigger GitHub Actions Deployment

## Manual Trigger

If the workflow isn't triggering automatically, try these steps:

### Option 1: Manual Workflow Dispatch
1. Go to https://github.com/sustainablehorticulture/backendfunctions/actions
2. Click on your workflow
3. Click "Run workflow" button
4. Select "master" branch
5. Click "Run workflow"

### Option 2: Make a Small Change
```bash
# Make a small change to trigger the workflow
echo "# Deployment test" >> azure-functions/lorawan-control/README.md
git add azure-functions/lorawan-control/README.md
git commit -m "Trigger deployment test"
git push github master
```

### Option 3: Check Workflow Path
The workflow triggers on:
- Branch: master
- Path: azure-functions/lorawan-control/**

Make sure files exist in that path in your GitHub repo.

## Common Issues

### 1. Missing AZURE_CREDENTIALS
- Go to GitHub → Settings → Secrets → Actions
- Add AZURE_CREDENTIALS with service principal JSON

### 2. Function App Doesn't Exist
```bash
# Create Function App
az functionapp create \
  --resource-group AgenticAG \
  --name agricultural-lorawan-control \
  --storage-account agriculturallorawan \
  --consumption-plan-location australia-southeast \
  --runtime node \
  --runtime-version 22 \
  --functions-version 4
```

### 3. Wrong Path Structure
GitHub repo should have:
```
azure-functions/
└── lorawan-control/
    ├── lorawan/
    ├── services/
    ├── host.json
    └── package.json
```

### 4. Permissions Issue
Service principal needs contributor access to the resource group.

## Debug Steps

1. Check GitHub Actions logs
2. Verify AZURE_CREDENTIALS secret exists
3. Confirm Function App exists
4. Check file structure in GitHub repo
5. Try manual workflow trigger
