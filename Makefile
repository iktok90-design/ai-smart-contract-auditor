.PHONY: help build build-mcp build-scripts test test-foundry test-nft test-mcp \
        test-scripts test-mcp-unit test-mcp-smoke docs gallery validate-rules bench \
        deploy-cert-testnet deploy-cert-mainnet \
        sample-cards sample-html demo audit-demo render-card clean fmt

DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: build-mcp build-scripts ## Build everything (MCP servers + scripts)

build-mcp: ## Build all 9 MCP servers
	cd mcp && npm install && npm run build

build-scripts: ## Build the scripts/ TypeScript bundle
	cd scripts && npm install && npm run build

test: test-foundry test-nft test-scripts test-mcp-unit test-mcp ## Run all test suites

test-foundry: ## Run Foundry exploit tests against the demo contracts
	forge test -vv

test-nft: ## Run AuditCertificate (soulbound NFT) tests
	FOUNDRY_PROFILE=nft forge test -vv

test-scripts: build-scripts ## Unit-test the parsers + cert signer (node:test)
	cd scripts && npm run test:only

test-mcp-unit: build-mcp ## Unit/integration-test the MCP servers offline (node:test)
	cd mcp && npm run test:only

test-mcp: ## MCP smoke test — JSON-RPC roundtrip against all servers
	node scripts/dist/test-mcp.js

test-mcp-smoke: test-mcp ## Alias for the MCP smoke test

sample-cards: build-scripts ## Render PNG audit cards for the 5 demo contracts
	@for pair in \
	  "VulnerableVault:samples/sample-findings.json:samples/sample-card.png" \
	  "SpotOracleLending:samples/findings-spot-oracle.json:samples/card-spot-oracle.png" \
	  "FlashLoanGovernance:samples/findings-flash-loan-gov.json:samples/card-flash-loan-gov.png" \
	  "Inflatable4626:samples/findings-inflatable.json:samples/card-inflatable.png" \
	  "ReplayableBridge:samples/findings-replayable-bridge.json:samples/card-replayable-bridge.png"; do \
	    IFS=: read -r name in out <<< "$$pair"; \
	    node scripts/dist/render-card.js --findings "$$in" --out "$$out"; \
	done
	cp samples/sample-card.png samples/card-*.png docs/assets/

sample-html: build-scripts ## Render the 5 sample audit reports as HTML pages
	@for pair in \
	  "audit-vulnerable-vault.md:docs/docs/sample-vulnerable-vault.html" \
	  "audit-spot-oracle-lending.md:docs/docs/sample-spot-oracle-lending.html" \
	  "audit-flash-loan-governance.md:docs/docs/sample-flash-loan-governance.html" \
	  "audit-inflatable-4626.md:docs/docs/sample-inflatable-4626.html" \
	  "audit-replayable-bridge.md:docs/docs/sample-replayable-bridge.html"; do \
	    IFS=: read -r src dst <<< "$$pair"; \
	    node scripts/dist/md-to-html.js --in "samples/$$src" --out "$$dst"; \
	done

docs: ## Regenerate the source-driven reference pages (commands/skills/agents/mcp)
	node scripts/generate-docs.mjs

gallery: ## Regenerate the audit gallery from docs/gallery/manifest.json
	node scripts/generate-gallery.mjs

validate-rules: ## Validate every bundled rule pack
	@for p in rules/*/; do \
	  if [ -f "$$p/pack.yml" ]; then node scripts/validate-rule-pack.mjs "$$p" || exit 1; fi; \
	done

bench: build-scripts ## Run the detection benchmark (pass FINDINGS=<dir> for real scores)
	node scripts/dist/benchmark.js --expected bench/expected.json $(if $(FINDINGS),--findings $(FINDINGS),)

deploy-cert-testnet: ## Deploy AuditCertificate to Berachain Bepolia testnet (needs RUGPROOF_ADMIN/ISSUER + funded key)
	FOUNDRY_PROFILE=nft forge script nft/script/Deploy.s.sol:Deploy \
	  --rpc-url https://bepolia.rpc.berachain.com --broadcast --verify

deploy-cert-mainnet: ## Deploy AuditCertificate to Berachain mainnet (run testnet first!)
	FOUNDRY_PROFILE=nft forge script nft/script/Deploy.s.sol:Deploy \
	  --rpc-url https://rpc.berachain.com --broadcast --verify

audit-demo: ## Run the bundled exploit PoC against VulnerableVault
	forge test --match-contract ExploitREENT001 -vv

demo: audit-demo ## Alias for audit-demo (reentrancy exploit PoC)

render-card: build-scripts ## Render an arbitrary card. Usage: make render-card IN=findings.json OUT=card.png
	node scripts/dist/render-card.js --findings "$(IN)" --out "$(OUT)"

clean: ## Remove build outputs
	rm -rf out out-nft cache mcp/*/dist scripts/dist

fmt: ## Format Solidity (forge fmt)
	forge fmt
