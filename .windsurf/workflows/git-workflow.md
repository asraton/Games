# Git Workflow for ASRA Game

## Adding changes to Git
1. Stage the changes:
   ```
   git add <filename>
   ```

## Committing changes
2. Commit with a descriptive message:
   ```
   git commit -m "Description of changes"
   ```

## Pushing to GitHub
3. Push to the main branch:
   ```
   git push origin main
   ```

## Important Notes
- Do NOT use `&&` to chain commands on Windows PowerShell
- Run each command separately
- Wait for each command to complete before running the next
- Check the output for any errors

## Common Commit Messages
- `Shop: [description]` - For shop-related changes
- `Help: [description]` - For help modal changes  
- `UI: [description]` - For UI improvements
- `Fix: [description]` - For bug fixes
