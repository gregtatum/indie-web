# To set up the deploy to github pages, first run:
# ----------
# cd dist
# git init -b gh-pages
# git remote add origin git@github.com:gregtatum/REPO.git

cd dist                            \
 && git add .                      \
 && git commit -m "Deploy $(date)" \
 && git push
