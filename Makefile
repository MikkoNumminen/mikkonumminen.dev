# One-command wrapper around docker-compose.yml for the RAG chat stack
# (build brief Phase 5). Run from WSL2 on Windows (bash + docker compose).

LLM_MODEL ?= gemma4:e4b
SHELL := bash

.DEFAULT_GOAL := help
.PHONY: help up index eval tunnel up-public down logs ps

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  %-12s %s\n", $$1, $$2}'

up: ## Start the full stack — db + ollama, pull the model, then the backend
	@echo "starting the stack (first run downloads $(LLM_MODEL) into the ollama volume — may take a few minutes)..."
	docker compose up -d backend
	@echo "backend up on http://localhost:8000 — index the corpus with: make index"

index: ## Embed the content corpus into pgvector (one-time / after content edits)
	docker compose run --rm backend python -m app.indexer

eval: ## Run the retrieval hit-rate eval (index first)
	docker compose run --rm backend python -m evals.run_eval

tunnel: ## Start ONLY the cloudflared tunnel (needs TUNNEL_TOKEN in .env)
	docker compose --profile tunnel up -d tunnel

up-public: up tunnel ## `make up`, then publish the backend via the Cloudflare tunnel

down: ## Stop everything (named volumes — db data + model — persist)
	docker compose --profile tunnel down

logs: ## Tail the backend logs
	docker compose logs -f backend

ps: ## Show stack status
	docker compose ps
