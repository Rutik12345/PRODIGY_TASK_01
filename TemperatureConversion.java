import java.util.Scanner;
public class TemperatureConversion {
        public static void main(String[] args) {
            Scanner scanner = new Scanner(System.in);

            // Prompt user for input
            System.out.println("Enter the temperature value:");
            double temperature = scanner.nextDouble();

            System.out.println("Enter the original unit of measurement (Celsius, Fahrenheit, or Kelvin):");
            String originalUnit = scanner.next();

            // Convert temperature to other units
            double convertedToFahrenheit = 0;
            double convertedToKelvin = 0;
            double convertedToCelsius = 0;
            switch (originalUnit.toLowerCase()) {
                case "celsius":
                    convertedToFahrenheit = (temperature * 9 / 5) + 32;
                    convertedToKelvin = temperature + 273.15;
                    convertedToCelsius = temperature;
                    break;
                case "fahrenheit":
                    convertedToCelsius = (temperature - 32) * 5/9;
                    convertedToKelvin = (temperature + 459.67) * 5 / 9;
                    convertedToFahrenheit = temperature;
                    break;
                case "kelvin":
                    convertedToFahrenheit = (temperature * 9 / 5) - 459.67;
                    convertedToCelsius = temperature - 273.15;
                    convertedToKelvin = temperature;
                    break;
                default:
                    System.out.println("Invalid input! Please enter Celsius, Fahrenheit, or Kelvin.");
                   
            }

            // Display the converted temperatures
            System.out.println("Converted Temperatures:");
            System.out.println("Fahrenheit: " + convertedToFahrenheit);
            System.out.println("Kelvin: " + convertedToKelvin);
            System.out.println("Celcius: " + convertedToCelsius);

            scanner.close();
        }
    }