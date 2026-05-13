export interface CreateEquipmentDto {
    brand: string;
    model: string;
    serialNumber: string;
    clientId: number;
    nickname?: string;
    additionalInfo?: string;
    status?: string;
}

export interface UpdateEquipmentDto extends Partial<CreateEquipmentDto> {}
