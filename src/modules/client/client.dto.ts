export interface CreateClientDto {
    name: string;
    nickname?: string;
    address?: string;
    city?: string;
    postCode?: string;
    nif?: string;
    is_blacklisted?: boolean;
    blacklist_reason?: string;
}

export interface UpdateClientDto extends Partial<CreateClientDto> {}
