#![cfg(test)]
use crate::{QuoteEscrow, QuoteEscrowClient};
use nectar_token::{NectarToken, NectarTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn deposit_reserve_withdraw_respects_reservation() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let maker = Address::generate(&env);
    let lending = Address::generate(&env);
    let coll = Address::generate(&env);

    let token_id = env.register(NectarToken, ());
    let token = NectarTokenClient::new(&env, &token_id);
    token.initialize(
        &admin,
        &String::from_str(&env, "Debt"),
        &String::from_str(&env, "DEBT"),
        &7,
    );
    token.mint(&maker, &20_000);

    let escrow_id = env.register(QuoteEscrow, ());
    let escrow = QuoteEscrowClient::new(&env, &escrow_id);
    escrow.initialize(&admin, &admin);
    escrow.admit_market(
        &String::from_str(&env, "morpho-stock-1"),
        &lending,
        &token_id,
        &coll,
        &1,
        &1,
    );
    escrow.deposit(&token_id, &15_000, &maker);
    assert_eq!(escrow.available_cash(&maker, &token_id), 15_000);

    let quote_id = escrow.register_quote(
        &maker,
        &String::from_str(&env, "morpho-stock-1"),
        &1,
        &100,
        &10_140,
        &10_000,
        &maker,
        &50,
        &20,
        &70,
        &maker,
        &maker,
        &30,
    );
    assert_eq!(escrow.available_cash(&maker, &token_id), 4_860);
    let q = escrow.get_quote(&quote_id);
    assert_eq!(q.cash_out, 10_140);
    escrow.withdraw(&token_id, &4_860, &maker);
    assert_eq!(escrow.available_cash(&maker, &token_id), 0);
}
