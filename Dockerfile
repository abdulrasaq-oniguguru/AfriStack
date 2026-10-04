FROM node:26-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/country-data/package.json packages/country-data/package.json
COPY packages/messaging-core/package.json packages/messaging-core/package.json
COPY packages/payments-core/package.json packages/payments-core/package.json
COPY packages/provider-africastalking/package.json packages/provider-africastalking/package.json
COPY packages/provider-paystack/package.json packages/provider-paystack/package.json
COPY packages/provider-termii/package.json packages/provider-termii/package.json
COPY packages/provider-flutterwave/package.json packages/provider-flutterwave/package.json
COPY packages/testkit/package.json packages/testkit/package.json
COPY apps/gateway apps/gateway
COPY packages/core packages/core
COPY packages/country-data packages/country-data
COPY packages/messaging-core packages/messaging-core
COPY packages/payments-core packages/payments-core
COPY packages/provider-africastalking packages/provider-africastalking
COPY packages/provider-paystack packages/provider-paystack
COPY packages/provider-termii packages/provider-termii
COPY packages/provider-flutterwave packages/provider-flutterwave
COPY packages/testkit packages/testkit
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @africa-dev/gateway... build
RUN pnpm --filter @africa-dev/gateway deploy --prod --legacy /deploy

FROM node:26-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /deploy ./
USER node
EXPOSE 4010
CMD ["node", "dist/server.js"]
