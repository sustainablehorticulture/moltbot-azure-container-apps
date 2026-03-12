# Force GitHub Actions to Use New Workflow

## Method 1: Manual Workflow Trigger
1. Go to https://github.com/sustainablehorticulture/backendfunctions/actions
2. Click on "LoRaWAN Control Deployment" workflow
3. Click "Run workflow" button
4. Select "master" branch
5. Click "Run workflow"

## Method 2: Make a Small Change to Trigger
```bash
# Make a tiny change to force new workflow
echo "# Trigger new workflow" >> azure-functions/lorawan-control/README.md
git add azure-functions/lorawan-control/README.md
git commit -m "Force new workflow trigger"
git push github master
```

## Method 3: Disable All Workflows Temporarily
1. Go to GitHub repository
2. Settings → Actions → General
3. Under "Workflow permissions", disable workflows
4. Commit changes
5. Re-enable workflows
6. This will clear all cached workflows

## Method 4: Delete and Recreate .github/workflows
```bash
# Delete entire workflows folder
rm -rf .github/workflows

# Recreate with new workflow
mkdir -p .github/workflows
# Add your new workflow file
git add .github/workflows/lorawan-deploy-fixed.yml
git commit -m "Fresh workflow folder"
git push github master
```

## Why This Happens
GitHub Actions caches workflows even after deletion. The cache can persist for several runs until a new workflow with a different name/path is created.

## Expected Result
The new workflow should:
- Only trigger on azure-functions/lorawan-control changes
- Use the correct folder (not root)
- Not run any tests
- Deploy successfully to Azure Functions
