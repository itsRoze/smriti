```bash
# Detect base branch via the shared bin/smriti-default-branch helper. Detection
# order lives in that script (origin/HEAD → main/master/develop existence →
# init.defaultBranch → "main"); both skill templates (via this resolver) and
# bin/ scripts (e.g., bin/smriti-clean) share that one source of truth.
BASE_BRANCH=$(smriti default-branch)
```
