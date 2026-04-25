```bash
# Detect base branch (origin/HEAD → fallback main → master → develop → main literal)
BASE_BRANCH=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')
if [ -z "$BASE_BRANCH" ]; then
  for candidate in main master develop; do
    if git show-ref --verify --quiet "refs/heads/$candidate" 2>/dev/null \
       || git show-ref --verify --quiet "refs/remotes/origin/$candidate" 2>/dev/null; then
      BASE_BRANCH="$candidate"; break
    fi
  done
fi
BASE_BRANCH="${BASE_BRANCH:-main}"
```
