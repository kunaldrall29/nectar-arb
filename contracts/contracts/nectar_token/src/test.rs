#![cfg(test)]
use crate::{NectarToken, NectarTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

#[test]
fn mint_and_transfer() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let user = Address::generate(&env);
    let other = Address::generate(&env);
    let id = env.register(NectarToken, ());
    let client = NectarTokenClient::new(&env, &id);
    client.initialize(
        &admin,
        &String::from_str(&env, "Nectar USD"),
        &String::from_str(&env, "nUSD"),
        &7,
    );
    client.mint(&user, &1_000_000);
    assert_eq!(client.balance(&user), 1_000_000);
    client.transfer(&user, &other, &250_000);
    assert_eq!(client.balance(&user), 750_000);
    assert_eq!(client.balance(&other), 250_000);
}
