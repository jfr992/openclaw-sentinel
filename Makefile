.PHONY: dev test test-watch test-coverage lint install clean

# Development
dev:
	@echo "Starting dev server..."
	cd server && npm run dev

serve:
	node server.js

# Testing
test:
	cd server && npm test

test-watch:
	cd server && npm run test:watch

test-coverage:
	cd server && npm run test:coverage

# Local CI (requires act: brew install act)
ci:
	act push

ci-test:
	act -j test-server

# Install
install:
	cd server && npm install
	npm install

# Clean
clean:
	rm -rf server/node_modules client/node_modules node_modules
	rm -rf server/coverage client/coverage

# Help
help:
	@echo "Available commands:"
	@echo "  make dev          - Start development server"
	@echo "  make serve        - Start production server"
	@echo "  make test         - Run all tests"
	@echo "  make test-watch   - Run tests in watch mode"
	@echo "  make test-coverage- Run tests with coverage"
	@echo "  make ci           - Run full CI locally (requires act)"
	@echo "  make ci-test      - Run test job locally"
	@echo "  make install      - Install all dependencies"
	@echo "  make clean        - Remove node_modules"
