# ADR 0005: External secret providers

Status: accepted — 2026-10-04

Phase 1 uses symbolic environment references through `SecretProvider`. Configuration files contain variable names, not values. The project will add adapters for systems such as Infisical, AWS Secrets Manager, and Vault; it will not implement an encryption vault.
