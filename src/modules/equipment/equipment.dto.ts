export interface CreateEquipmentDto {
    brand: string;
    model?: string;
    serialNumber?: string;
    clientId: number;
    additionalInfo?: string;
}

export interface UpdateEquipmentDto extends Partial<CreateEquipmentDto> {}
