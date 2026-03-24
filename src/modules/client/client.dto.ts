export interface CreateClientDto {
    name: string;
    address?: string;
    city?: string;
    postCode?: string;
    nif?: string;
}

export interface UpdateClientDto extends Partial<CreateClientDto> {}
