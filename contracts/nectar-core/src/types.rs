use soroban_sdk::{contracterror, contracttype, Address, BytesN};

pub const SCHEMA_VERSION: u32 = 1;
pub const HF_ONE: i128 = 10_000_000;
/// Testnet policy: quotes may live up to 5 minutes so a human demo can finish.
pub const MAX_QUOTE_TTL: u64 = 300;
pub const MIN_QUOTE_TTL: u64 = 15;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInit = 1,
    AlreadyInit = 2,
    Unauthorized = 3,
    ScopePaused = 4,
    InvalidAmount = 5,
    InsufficientCash = 6,
    ReservedFunds = 7,
    QuoteExists = 8,
    QuoteNotFound = 9,
    QuoteExpired = 10,
    QuoteNotExpired = 11,
    QuoteConsumed = 12,
    QuoteReleased = 13,
    MarketNotFound = 14,
    MarketMismatch = 15,
    PositionChanged = 16,
    InsufficientProceeds = 17,
    InvalidExpiry = 18,
    TokenMismatch = 19,
    QuoteNotFunded = 20,
    NotLiquidatable = 21,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Market {
    pub market_key: BytesN<32>,
    pub chain_id: u32,
    pub protocol: soroban_sdk::Symbol,
    pub market_id: soroban_sdk::Symbol,
    pub debt_token: Address,
    pub collateral_token: Address,
    pub adapter: Address,
    pub policy_version: u32,
    pub max_quote_ttl: u64,
    pub admitted: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MakerAccount {
    pub cash: i128,
    pub reserved: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuoteSpec {
    pub market_key: BytesN<32>,
    pub borrower: Address,
    pub collateral_amount: i128,
    pub cash_out: i128,
    pub max_debt_repay: i128,
    pub collateral_recipient: Address,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub min_net_surplus: i128,
    pub keeper_recipient: Address,
    pub surplus_recipient: Address,
    pub valid_until: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Quote {
    pub schema_version: u32,
    pub quote_id: BytesN<32>,
    pub maker: Address,
    pub maker_nonce: u64,
    pub market_key: BytesN<32>,
    pub borrower: Address,
    pub collateral_token: Address,
    pub collateral_amount: i128,
    pub debt_token: Address,
    pub cash_out: i128,
    pub max_debt_repay: i128,
    pub collateral_recipient: Address,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub min_net_surplus: i128,
    pub keeper_recipient: Address,
    pub surplus_recipient: Address,
    pub valid_until: u64,
    pub reservation_id: BytesN<32>,
    pub consumed: bool,
    pub released: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Preview {
    pub ok: bool,
    pub reason: soroban_sdk::Symbol,
    pub debt_repay: i128,
    pub collateral_amount: i128,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub surplus: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Receipt {
    pub quote_id: BytesN<32>,
    pub market_key: BytesN<32>,
    pub borrower: Address,
    pub maker: Address,
    pub debt_repay: i128,
    pub collateral_amount: i128,
    pub keeper_compensation: i128,
    pub protocol_fee: i128,
    pub surplus: i128,
    pub writeoff: i128,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Guardian,
    Paused,
    FeeRecipient,
    Market(BytesN<32>),
    Account(Address, Address),
    Quote(BytesN<32>),
    Receipt(BytesN<32>),
    Nonce(Address),
}

impl MakerAccount {
    pub fn available(&self) -> i128 {
        self.cash - self.reserved
    }
}
