export class ProposalConcurrencyError extends Error {
  constructor(message = "Proposal changed while the operation was in progress.") {
    super(message);
    this.name = "ProposalConcurrencyError";
  }
}

export class ProposalPersistenceError extends Error {
  constructor(message = "Proposal persistence failed.", options?: ErrorOptions) {
    super(message, options);
    this.name = "ProposalPersistenceError";
  }
}
