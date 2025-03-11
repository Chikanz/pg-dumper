#!/bin/bash

# I chose this config since it's slow enough to keep the main db from being throttled

fly m run . \
    --dockerfile Dockerfile \
   --region iad \
   -a pg-backup-slut-personal \
   --schedule=daily \
    --vm-memory 2048 \
    --vm-cpus 8 \
    --restart no \
    --vm-cpu-kind shared

#  Deploy to personal org
#fly m run pg-backup-slut:deployment-01JNYSMWP86VQRRM922H0JZVFP \
#   --region iad \
#   -a pg-backup-slut-personal \
#   --schedule=daily \
#    --vm-memory 2048 \
#    --vm-cpus 8 \
#    --restart no \
#    --vm-cpu-kind shared

# If you don't need to make changes but need to redeploy you can do e.g.
#fly m run registry.fly.io/pg-backup-slut:deployment-xxxxxx \
#   --region iad \
#   -a pg-backup-slut \
#   --schedule=daily \
#    --vm-memory 1536 \
#    --vm-cpus 6 \
#    --vm-cpu-kind shared
