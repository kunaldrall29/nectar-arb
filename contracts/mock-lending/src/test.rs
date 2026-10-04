#![cfg(test)]

use crate::{MockLending, MockLendingClient, HF_ONE};
use mock_token::{MockToken, MockTokenClient};
use soroban_sdk::{testutils::Address as _, Address, Env, String};

fn token<'a>(env: &'a Env, admin: &Address, symbol: &str) -> MockTokenClient<'a> {
    let id = env.register(MockToken, ());
    let client = MockTokenClient::new(env, &id);
    client.initialize(
        admin,
        &String::from_str(env, symbol),
        &String::from_str(env, symbol),
        &7,
    );
    client
}

#[test]
fn seed_and_liquidate() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);
    let keeper = Address::generate(&env);
    let recipient = Address::generate(&env);

    let usdc = token(&env, &admin, "USDC");
    let hood = token(&env, &admin, "HOOD");
    let lab_id = env.register(MockLending, ());
    let lab = MockLendingClient::new(&env, &lab_id);
    lab.initialize(&admin);

    hood.mint(&admin, &12_000_0000000);
    usdc.mint(&keeper, &10_000_0000000);

    lab.admin_seed_position(
        &admin,
        &borrower,
        &hood.address,
        &12_000_0000000,
        &usdc.address,
        &10_000_0000000,
        &(HF_ONE * 8 / 10),
    );
    assert!(lab.is_liquidatable(&borrower));

    usdc.transfer(&keeper, &lab.address, &10_000_0000000);
    let seized = lab.liquidate(&borrower, &10_000_0000000, &recipient);
    assert_eq!(seized, 12_000_0000000);
    assert_eq!(hood.balance(&recipient), 12_000_0000000);
    assert_eq!(usdc.balance(&lab.address), 10_000_0000000);
    let pos = lab.get_position(&borrower);
    assert!(!pos.open);
}

#[test]
fn healthy_position_cannot_liquidate() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let borrower = Address::generate(&env);
    let keeper = Address::generate(&env);
    let usdc = token(&env, &admin, "USDC");
    let hood = token(&env, &admin, "HOOD");
    let lab = MockLendingClient::new(&env, &env.register(MockLending, ()));
    lab.initialize(&admin);
    hood.mint(&admin, &5_000_0000000);
    usdc.mint(&keeper, &5_000_0000000);
    lab.admin_seed_position(
        &admin,
        &borrower,
        &hood.address,
        &5_000_0000000,
        &usdc.address,
        &4_000_0000000,
        &(HF_ONE + 1),
    );
    assert!(!lab.is_liquidatable(&borrower));
    assert!(lab
        .try_liquidate(&borrower, &1_000_0000000, &keeper)
        .is_err());
}
