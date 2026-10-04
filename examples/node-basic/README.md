# Node gateway example

Start the local mock gateway from the repository root:

```sh
docker compose up -d --build
node examples/node-basic/index.mjs
```

The example creates a payment, verifies it, delivers a signed mock webhook twice, and reads the resulting canonical event. It uses only the local mock provider and development API key.
