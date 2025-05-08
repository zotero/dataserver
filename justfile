#!/usr/bin/env just --justfile

NAMESPACE := 'zotero-custom'

# List available recipes
default:
  @just --list

build:
  docker image build -t ghcr.io/{{ NAMESPACE }}/dataserver:latest .

sh:
  docker run --rm -it --env-file {{source_dir()}}/.env --entrypoint bash ghcr.io/{{ NAMESPACE }}/dataserver:latest