import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { Button, ButtonText } from '@/components/ui/button/index';
import { Input, InputField } from '@/components/ui/input/index';

export default function GluestackSandboxScreen() {
  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <Text className="text-2xl font-bold text-foreground">Gluestack UI Sandbox</Text>
      
      <View className="gap-4">
        <Text className="text-lg font-semibold text-foreground">Buttons</Text>
        <Button variant="default">
          <ButtonText>Primary Button</ButtonText>
        </Button>
        <Button variant="secondary">
          <ButtonText>Secondary Button</ButtonText>
        </Button>
        <Button variant="destructive">
          <ButtonText>Destructive Button</ButtonText>
        </Button>
      </View>

      <View className="gap-4 mt-6">
        <Text className="text-lg font-semibold text-foreground">Inputs</Text>
        <Input>
          <InputField placeholder="Enter something..." />
        </Input>
        <Input isDisabled>
          <InputField placeholder="Disabled input" />
        </Input>
      </View>
    </ScrollView>
  );
}
