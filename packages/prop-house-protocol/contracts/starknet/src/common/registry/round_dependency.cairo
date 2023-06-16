#[contract]
mod RoundDependencyRegistry {
    use starknet::contract_address::ContractAddressZeroable;
    use starknet::{get_caller_address, ContractAddress, ContractAddressIntoFelt252};
    use prop_house::common::libraries::ownable::Ownable;
    use prop_house::common::utils::storage::SpanStorageAccess;
    use prop_house::common::utils::traits::IRoundDependencyRegistry;
    use prop_house::common::utils::serde::SpanSerde;
    use array::{ArrayTrait, SpanTrait};
    use zeroable::Zeroable;
    use traits::Into;

    struct Storage {
        _is_key_locked: LegacyMap<(u64, ContractAddress, felt252), bool>,
        _single_dependency: LegacyMap<(u64, ContractAddress, felt252), ContractAddress>,
        _multiple_dependencies: LegacyMap<(u64, ContractAddress, felt252), Span<ContractAddress>>,
    }

    /// Emitted when a dependency key is locked for a chain ID and round address.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    #[event]
    fn KeyLocked(chain_id: u64, round_address: ContractAddress) {}

    /// Emitted when a dependency is updated for a chain ID, round address and key.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The dependency key.
    /// * `dependency` - The dependency address.
    #[event]
    fn DependencyUpdated(chain_id: u64, round_address: ContractAddress, key: felt252, dependency: ContractAddress) {}

    /// Emitted when dependencies are updated for a chain ID, round address and key.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The dependency key.
    /// * `dependencies` - The dependency addresses.
    #[event]
    fn DependenciesUpdated(chain_id: u64, round_address: ContractAddress, key: felt252, dependencies: Span<ContractAddress>) {}

    impl RoundDependencyRegistry of IRoundDependencyRegistry {
        fn is_key_locked(chain_id: u64, round_address: ContractAddress, key: felt252) -> bool {
            _is_key_locked::read((chain_id, round_address, key))
        }

        fn get_dependency_at_key(chain_id: u64, round_address: ContractAddress, key: felt252) -> ContractAddress {
            assert(_is_key_locked::read((chain_id, round_address, key)), 'MCRCR: Dependency not locked');

            _single_dependency::read((chain_id, round_address, key))
        }

        fn get_dependencies_at_key(chain_id: u64, round_address: ContractAddress, key: felt252) -> Span<ContractAddress> {
            assert(_is_key_locked::read((chain_id, round_address, key)), 'MCRCR: Dependencies not locked');

            _multiple_dependencies::read((chain_id, round_address, key))
        }

        fn get_caller_dependency_at_key(chain_id: u64, key: felt252) -> ContractAddress {
            RoundDependencyRegistry::get_dependency_at_key(chain_id, get_caller_address(), key)
        }

        fn get_caller_dependencies_at_key(chain_id: u64, key: felt252) -> Span<ContractAddress> {
            RoundDependencyRegistry::get_dependencies_at_key(chain_id, get_caller_address(), key)
        }

        fn update_dependency_if_not_locked(chain_id: u64, round_address: ContractAddress, key: felt252, dependency: ContractAddress) {
            Ownable::assert_only_owner();

            assert(!_is_key_locked::read((chain_id, round_address, key)), 'MCRCR: Dependency locked');
            _single_dependency::write((chain_id, round_address, key), dependency);

            DependencyUpdated(chain_id, round_address, key, dependency);
        }

        fn update_dependencies_if_not_locked(chain_id: u64, round_address: ContractAddress, key: felt252, dependencies: Span<ContractAddress>) {
            Ownable::assert_only_owner();

            assert(!_is_key_locked::read((chain_id, round_address, key)), 'MCRCR: Dependencies locked');
            _multiple_dependencies::write((chain_id, round_address, key), dependencies);

            DependenciesUpdated(chain_id, round_address, key, dependencies);
        }

        fn lock_key(chain_id: u64, round_address: ContractAddress, key: felt252) {
            Ownable::assert_only_owner();

            assert(!_is_key_locked::read((chain_id, round_address, key)), 'MCRCR: Key already locked');
            _is_key_locked::write((chain_id, round_address, key), true);

            KeyLocked(chain_id, round_address);
        }
    }

    #[constructor]
    fn constructor() {
        Ownable::initializer();
    }

    /// Returns true if the key is locked for the given chain id and round.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The key.
    #[view]
    fn is_key_locked(chain_id: u64, round_address: ContractAddress, key: felt252) -> bool {
        RoundDependencyRegistry::is_key_locked(chain_id, round_address, key)
    }

    /// Returns the dependency at the given key for the provided chain id and round.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The key.
    #[view]
    fn get_dependency_at_key(chain_id: u64, round_address: ContractAddress, key: felt252) -> ContractAddress {
        RoundDependencyRegistry::get_dependency_at_key(chain_id, round_address, key)
    }

    /// Returns the dependencies at the given key for the provided chain id and round.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The key.
    #[view]
    fn get_dependencies_at_key(chain_id: u64, round_address: ContractAddress, key: felt252) -> Span<ContractAddress> {
        RoundDependencyRegistry::get_dependencies_at_key(chain_id, round_address, key)
    }

    /// Returns the dependency at the given key for the provided chain id and caller.
    /// * `chain_id` - The chain id.
    /// * `key` - The key.
    #[view]
    fn get_caller_dependency_at_key(chain_id: u64, key: felt252) -> ContractAddress {
        RoundDependencyRegistry::get_caller_dependency_at_key(chain_id, key)
    }

    /// Returns the dependencies at the given key for the provided chain id and caller.
    /// * `chain_id` - The chain id.
    /// * `key` - The key.
    #[view]
    fn get_caller_dependencies_at_key(chain_id: u64, key: felt252) -> Span<ContractAddress> {
        RoundDependencyRegistry::get_caller_dependencies_at_key(chain_id, key)
    }

    /// Returns the owner of the contract.
    #[view]
    fn owner() -> ContractAddress {
        Ownable::owner()
    }

    /// If not locked, updates the dependency at the given key for the provided chain id and round.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The key.
    /// * `dependency` - The dependency.
    #[external]
    fn update_dependency_if_not_locked(chain_id: u64, round_address: ContractAddress, key: felt252, dependency: ContractAddress) {
        RoundDependencyRegistry::update_dependency_if_not_locked(chain_id, round_address, key, dependency)
    }

    /// If not locked, updates the dependencies at the given key for the provided chain id and round.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The key.
    /// * `dependencies` - The dependencies.
    #[external]
    fn update_dependencies_if_not_locked(chain_id: u64, round_address: ContractAddress, key: felt252, dependencies: Span<ContractAddress>) {
        RoundDependencyRegistry::update_dependencies_if_not_locked(chain_id, round_address, key, dependencies)
    }

    /// Locks the key for the given chain id and round.
    /// * `chain_id` - The chain id.
    /// * `round_address` - The round address.
    /// * `key` - The key.
    #[external]
    fn lock_key(chain_id: u64, round_address: ContractAddress, key: felt252) {
        RoundDependencyRegistry::lock_key(chain_id, round_address, key)
    }

    /// Transfers ownership of the contract to a new owner.
    /// * `new_owner` - The new owner.
    #[external]
    fn transfer_ownership(new_owner: ContractAddress) {
        Ownable::transfer_ownership(new_owner);
    }
}